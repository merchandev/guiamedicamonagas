import type { Server as HttpServer } from 'node:http';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, type Socket } from 'socket.io';
import type { Role } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { SESSION_USER_SELECT, sessionUserFrom } from '../auth/session-user';
import type { RealtimeMessage, RealtimeRoom } from './realtime-audience';

export const REALTIME_PATH = '/api/v1/realtime';
const MAX_SOCKETS_PER_IP = 50;
const MAX_WATCHED_PROFESSIONALS = 10;
const MAX_WATCH_REQUESTS_PER_MINUTE = 30;
const REVALIDATE_EVERY_MS = 120_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAFF_ROLES: readonly Role[] = ['ADMIN', 'SUPERADMIN'];

interface SocketData {
  ip: string;
  userId?: string;
  role?: Role;
  tokenVersion?: number;
  watchRequests: number[];
}

type RealtimeSocket = Socket & { data: SocketData };

/**
 * Canal en tiempo real (Socket.IO en /api/v1/realtime, el mismo origen de la API).
 *
 * - Con el token de acceso en `auth.token`, la conexión entra a las salas de su
 *   cuenta (`user:`), de su perfil de médico (`pro:`), de sus organizaciones
 *   (`org:`) y de administración (`staff`). El cliente no elige sus salas.
 * - Sin token, solo a `all` (directorio y catálogos). Cualquiera puede mirar los
 *   horarios libres de un médico publicado con `watch`.
 * - Los mensajes (`sync`) solo dicen qué tema cambió: los datos se piden a la API.
 * - Un cambio de sesión (contraseña, cierre de sesiones, suspensión, baja) corta
 *   las conexiones de esa cuenta; además se revisan todas cada 2 minutos.
 */
@Injectable()
export class RealtimeServer implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeServer.name);
  private io?: Server;
  private readonly socketsPerIp = new Map<string, number>();
  private revalidateTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  get enabled() {
    return !!this.io;
  }

  attach(httpServer: HttpServer) {
    if (!this.config.get('REALTIME_ENABLED', { infer: true }) || this.io) return;
    this.io = new Server(httpServer, {
      path: REALTIME_PATH,
      serveClient: false,
      transports: ['websocket', 'polling'],
      // El token viaja en el mensaje de conexión, no en cookies: el origen no da
      // acceso a nada. La app móvil no envía Origin.
      cors: { origin: this.config.get('FRONTEND_URL', { infer: true }), credentials: false },
      maxHttpBufferSize: 4 * 1024,
      pingInterval: 25_000,
      pingTimeout: 20_000,
      connectTimeout: 10_000,
    });
    this.io.use((socket, next) => {
      this.authenticate(socket as RealtimeSocket).then(
        () => next(),
        (error: Error) => next(error),
      );
    });
    this.io.on('connection', (socket) => void this.onConnection(socket as RealtimeSocket));
    this.revalidateTimer = setInterval(() => void this.revalidateAll(), REVALIDATE_EVERY_MS);
    this.revalidateTimer.unref();
    this.logger.log(`Canal en tiempo real activo en ${REALTIME_PATH}`);
  }

  async onModuleDestroy() {
    if (this.revalidateTimer) clearInterval(this.revalidateTimer);
    await this.io?.close();
    this.io = undefined;
  }

  emit(room: RealtimeRoom, message: RealtimeMessage) {
    this.io?.to(room).emit('sync', message);
  }

  /** Revisa la sesión y las salas de estas cuentas: corta las que ya no valen. */
  async refreshUsers(userIds: string[]) {
    if (!this.io || !userIds.length) return;
    const rows = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: SESSION_USER_SELECT });
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const userId of userIds) {
      const sockets = (await this.io.in(`user:${userId}`).fetchSockets()) as unknown as RealtimeSocket[];
      if (!sockets.length) continue;
      const row = byId.get(userId) ?? null;
      for (const socket of sockets) {
        const user = sessionUserFrom(row, socket.data.tokenVersion ?? 0);
        if (!user) {
          socket.emit('session', { reason: 'revoked' });
          socket.disconnect(true);
          continue;
        }
        socket.data.role = user.role;
        await this.syncPrivateRooms(socket, user.id, user.role);
      }
    }
  }

  private clientIp(socket: RealtimeSocket): string {
    // Caddy reemplaza X-Real-IP con la IP real del visitante (ver Caddyfile).
    const header = socket.handshake.headers['x-real-ip'];
    const ip = typeof header === 'string' && header.length <= 64 ? header : socket.handshake.address;
    return ip || 'desconocida';
  }

  private async authenticate(socket: RealtimeSocket) {
    const ip = this.clientIp(socket);
    if ((this.socketsPerIp.get(ip) ?? 0) >= MAX_SOCKETS_PER_IP) throw new Error('too_many_connections');
    socket.data = { ip, watchRequests: [] };
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    if (token === undefined || token === null || token === '') return;
    if (typeof token !== 'string' || token.length > 4096) throw new Error('unauthorized');
    let payload: { sub?: string; tv?: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new Error('unauthorized');
    }
    if (typeof payload.sub !== 'string') throw new Error('unauthorized');
    const row = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: SESSION_USER_SELECT });
    const user = sessionUserFrom(row, payload.tv ?? 0);
    if (!user) throw new Error('unauthorized');
    socket.data.userId = user.id;
    socket.data.role = user.role;
    socket.data.tokenVersion = payload.tv ?? 0;
  }

  private async onConnection(socket: RealtimeSocket) {
    const { ip } = socket.data;
    this.socketsPerIp.set(ip, (this.socketsPerIp.get(ip) ?? 0) + 1);
    socket.on('disconnect', () => {
      const remaining = (this.socketsPerIp.get(ip) ?? 1) - 1;
      if (remaining > 0) this.socketsPerIp.set(ip, remaining);
      else this.socketsPerIp.delete(ip);
    });
    socket.on('watch', (message: unknown, ack?: unknown) => void this.watch(socket, message, ack));
    socket.on('unwatch', (message: unknown) => {
      const id = (message as { professionalId?: unknown } | null)?.professionalId;
      if (typeof id === 'string' && UUID.test(id)) void socket.leave(`pub:pro:${id}`);
    });
    await socket.join('all');
    if (socket.data.userId && socket.data.role) {
      try {
        await this.syncPrivateRooms(socket, socket.data.userId, socket.data.role);
      } catch (error) {
        this.logger.warn(`No se pudieron asignar las salas de una conexión: ${(error as Error).message}`);
        socket.disconnect(true);
        return;
      }
    }
    socket.emit('ready', { authenticated: !!socket.data.userId });
  }

  /** Salas privadas que corresponden hoy a la cuenta; deja las que ya no. */
  private async syncPrivateRooms(socket: RealtimeSocket, userId: string, role: Role) {
    const [profile, memberships] = await Promise.all([
      role === 'PROFESSIONAL'
        ? this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } })
        : Promise.resolve(null),
      this.prisma.organizationMember.findMany({ where: { userId }, select: { organizationId: true } }),
    ]);
    const wanted = new Set<string>([`user:${userId}`]);
    if (profile) wanted.add(`pro:${profile.id}`);
    if (STAFF_ROLES.includes(role)) wanted.add('staff');
    for (const { organizationId } of memberships) wanted.add(`org:${organizationId}`);
    for (const room of socket.rooms) {
      const isPrivate = room === 'staff' || room.startsWith('user:') || room.startsWith('pro:') || room.startsWith('org:');
      if (isPrivate && !wanted.has(room)) await socket.leave(room);
    }
    await socket.join([...wanted]);
  }

  /** Horarios libres de un médico publicado (también sin sesión). */
  private async watch(socket: RealtimeSocket, message: unknown, ack: unknown) {
    const reply = (ok: boolean) => {
      if (typeof ack === 'function') (ack as (result: { ok: boolean }) => void)({ ok });
    };
    const now = Date.now();
    socket.data.watchRequests = socket.data.watchRequests.filter((at) => now - at < 60_000);
    if (socket.data.watchRequests.length >= MAX_WATCH_REQUESTS_PER_MINUTE) return reply(false);
    socket.data.watchRequests.push(now);
    const id = (message as { professionalId?: unknown } | null)?.professionalId;
    if (typeof id !== 'string' || !UUID.test(id)) return reply(false);
    const watched = [...socket.rooms].filter((room) => room.startsWith('pub:pro:'));
    if (!watched.includes(`pub:pro:${id}`) && watched.length >= MAX_WATCHED_PROFESSIONALS) await socket.leave(watched[0]);
    try {
      const professional = await this.prisma.professionalProfile.findFirst({ where: { id, isPublished: true }, select: { id: true } });
      if (!professional) return reply(false);
      await socket.join(`pub:pro:${id}`);
      reply(true);
    } catch {
      reply(false);
    }
  }

  private async revalidateAll() {
    if (!this.io) return;
    try {
      const sockets = (await this.io.fetchSockets()) as unknown as RealtimeSocket[];
      const userIds = [...new Set(sockets.map((socket) => socket.data.userId).filter((id): id is string => !!id))];
      for (let i = 0; i < userIds.length; i += 500) await this.refreshUsers(userIds.slice(i, i + 500));
    } catch (error) {
      this.logger.warn(`No se pudieron revisar las sesiones del canal: ${(error as Error).message}`);
    }
  }
}
