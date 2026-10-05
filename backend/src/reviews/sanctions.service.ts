import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { SanctionType, UserSanction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Permission, roleHasPermissions } from '../common/permissions';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { sanctionTemplate, type SanctionNoticeKind } from '../mail/mail.templates';
import { recomputeSuspendedUntil, sanctionEndLabel, sanctionEndsAt, sanctionUntilText } from './sanction-rules';
import type { CreateSanctionDto, SanctionDurationDto } from './dto/moderation.dto';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const SANCTIONABLE_ROLES = ['USER', 'PROFESSIONAL'] as const;

const TYPE_LABELS: Record<SanctionType, string> = {
  REVIEWS: 'Sin opiniones ni respuestas',
  ACCOUNT: 'Cuenta suspendida',
};

/**
 * Sanciones por lo escrito en valoraciones o respuestas, por los días que
 * elija la administración (1 a 365) o, solo la de opiniones, indefinida. La
 * suspensión temporal de la cuenta cierra sus sesiones pero, a diferencia de
 * la suspensión de «Cuentas», no revoca autorizaciones ni cancela citas. Todo
 * queda en la auditoría y el titular recibe el motivo, el fin y cómo reclamar.
 */
@Injectable()
export class SanctionsService {
  private readonly logger = new Logger(SanctionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  present(sanction: UserSanction, now = new Date()) {
    const active = !sanction.liftedAt && sanction.startsAt <= now && (!sanction.endsAt || sanction.endsAt > now);
    return {
      id: sanction.id,
      type: sanction.type,
      typeLabel: TYPE_LABELS[sanction.type],
      reason: sanction.reason,
      startsAt: sanction.startsAt,
      endsAt: sanction.endsAt,
      reviewId: sanction.reviewId,
      liftedAt: sanction.liftedAt,
      liftReason: sanction.liftReason,
      active,
    };
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.userSanction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const now = new Date();
    return rows.map((row) => this.present(row, now));
  }

  /** Días o indefinida; la suspensión de la cuenta siempre es por días (la indefinida es la de «Cuentas»). */
  private duration(dto: SanctionDurationDto, type: SanctionType): number | null {
    const indefinite = dto.indefinite === true;
    if ((dto.days !== undefined) === indefinite) {
      throw new BadRequestException('Indica los días (de 1 a 365) o que es indefinida');
    }
    if (indefinite && type === 'ACCOUNT') {
      throw new BadRequestException('La suspensión de la cuenta es por días; para suspenderla sin fecha usa «Cuentas»');
    }
    return indefinite ? null : dto.days!;
  }

  async create(dto: CreateSanctionDto, actor: AuthenticatedUser, ipAddress?: string) {
    const days = this.duration(dto, dto.type);
    if (dto.type === 'ACCOUNT' && !roleHasPermissions(actor.role, [Permission.MANAGE_ACCOUNTS])) {
      throw new ForbiddenException('Suspender una cuenta exige además el permiso de administrar cuentas');
    }
    const target = await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true, role: true, purgedAt: true } });
    if (!target || target.purgedAt || target.id === actor.id || !(SANCTIONABLE_ROLES as readonly string[]).includes(target.role)) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    const now = new Date();
    const sanction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userSanction.create({
        data: {
          userId: target.id,
          type: dto.type,
          reason: dto.reason,
          startsAt: now,
          endsAt: sanctionEndsAt(days, now),
          reviewId: dto.reviewId ?? null,
          createdById: actor.id,
        },
      });
      if (dto.type === 'ACCOUNT') {
        await recomputeSuspendedUntil(tx, target.id, now);
        // Cierra sus sesiones al instante; sus autorizaciones y citas siguen.
        await tx.user.update({ where: { id: target.id }, data: { tokenVersion: { increment: 1 } } });
        await tx.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: now } });
      }
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'SANCTION_APPLIED',
          resource: 'UserSanction',
          resourceId: created.id,
          details: { targetUserId: target.id, type: dto.type, days, reviewId: dto.reviewId ?? null, reason: dto.reason },
          ipAddress,
        },
      });
      return created;
    });
    await this.notifyHolder(sanction, 'APPLIED');
    return this.present(sanction);
  }

  private async activeOrThrow(id: string) {
    const sanction = await this.prisma.userSanction.findUnique({ where: { id } });
    if (!sanction) throw new NotFoundException('Sanción no encontrada');
    if (!this.present(sanction).active) throw new ConflictException('La sanción ya terminó o se levantó');
    return sanction;
  }

  /** Cambia el fin: `days` contados desde hoy, o indefinida (solo opiniones). Sirve para extenderla o acortarla. */
  async change(id: string, dto: SanctionDurationDto, actor: AuthenticatedUser, ipAddress?: string) {
    const sanction = await this.activeOrThrow(id);
    const days = this.duration(dto, sanction.type);
    if (sanction.type === 'ACCOUNT' && !roleHasPermissions(actor.role, [Permission.MANAGE_ACCOUNTS])) {
      throw new ForbiddenException('Cambiar una suspensión de cuenta exige además el permiso de administrar cuentas');
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.userSanction.update({
        where: { id },
        data: { endsAt: sanctionEndsAt(days, now), endNoticeSentAt: null },
      });
      if (saved.type === 'ACCOUNT') await recomputeSuspendedUntil(tx, saved.userId, now);
      await tx.auditLog.create({
        data: { userId: actor.id, action: 'SANCTION_CHANGED', resource: 'UserSanction', resourceId: id, details: { days }, ipAddress },
      });
      return saved;
    });
    await this.notifyHolder(updated, 'CHANGED');
    return this.present(updated);
  }

  async lift(id: string, reason: string, actor: AuthenticatedUser, ipAddress?: string) {
    const sanction = await this.activeOrThrow(id);
    if (sanction.type === 'ACCOUNT' && !roleHasPermissions(actor.role, [Permission.MANAGE_ACCOUNTS])) {
      throw new ForbiddenException('Levantar una suspensión de cuenta exige además el permiso de administrar cuentas');
    }
    const now = new Date();
    const lifted = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.userSanction.update({
        where: { id },
        data: { liftedAt: now, liftedById: actor.id, liftReason: reason },
      });
      if (saved.type === 'ACCOUNT') await recomputeSuspendedUntil(tx, saved.userId, now);
      await tx.auditLog.create({
        data: { userId: actor.id, action: 'SANCTION_LIFTED', resource: 'UserSanction', resourceId: id, details: { reason }, ipAddress },
      });
      return saved;
    });
    await this.notifyHolder(lifted, 'LIFTED', reason);
    return this.present(lifted);
  }

  /**
   * Cada 10 minutos: las sanciones que vencieron dejan de aplicarse (la API ya
   * no las cuenta al pasar la fecha), se libera la cuenta y se avisa al titular.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async closeEndedSanctions() {
    const now = new Date();
    const ended = await this.prisma.userSanction.findMany({
      where: { liftedAt: null, endNoticeSentAt: null, endsAt: { lte: now } },
      take: 200,
    });
    for (const sanction of ended) {
      try {
        const marked = await this.prisma.$transaction(async (tx) => {
          const result = await tx.userSanction.updateMany({ where: { id: sanction.id, endNoticeSentAt: null }, data: { endNoticeSentAt: now } });
          if (result.count && sanction.type === 'ACCOUNT') await recomputeSuspendedUntil(tx, sanction.userId, now);
          return result.count > 0;
        });
        if (!marked) continue;
        await this.notifications.notify({
          userId: sanction.userId,
          type: 'SANCTION_ENDED',
          title: 'Terminó tu sanción',
          content:
            sanction.type === 'ACCOUNT'
              ? 'Ya puedes iniciar sesión con normalidad.'
              : 'Ya puedes volver a escribir opiniones y respuestas.',
        });
      } catch (error) {
        this.logger.warn(`No se pudo cerrar la sanción ${sanction.id}: ${(error as Error).message}`);
      }
    }
  }

  private async notifyHolder(sanction: UserSanction, kind: SanctionNoticeKind, liftReason?: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: sanction.userId },
        select: {
          email: true,
          patientProfile: { select: { firstName: true } },
          professionalProfile: { select: { firstName: true } },
        },
      });
      if (!user) return;
      const name = user.professionalProfile ? `Dr(a). ${user.professionalProfile.firstName}` : (user.patientProfile?.firstName ?? 'Paciente');
      const account = sanction.type === 'ACCOUNT';
      const reason = kind === 'LIFTED' ? (liftReason ?? sanction.reason) : sanction.reason;
      const title =
        kind === 'LIFTED' ? 'Se levantó tu sanción' : account ? 'Tu cuenta está suspendida' : 'No puedes publicar opiniones por un tiempo';
      const content =
        kind === 'LIFTED'
          ? `La administración levantó tu sanción. Motivo: ${reason}`
          : `${account ? 'No podrás iniciar sesión' : 'No podrás escribir ni editar opiniones ni respuestas'} ${sanctionUntilText(sanction.endsAt)}. Motivo: ${reason}. Si no estás de acuerdo, abre este aviso para reclamar.`;
      await this.notifications.notify({
        userId: sanction.userId,
        type: `SANCTION_${kind}`,
        title,
        content,
        link: '/reclamos',
        email: {
          to: user.email,
          subject: `${title} — Guía Médica Monagas`,
          template: `sanction_${kind.toLowerCase()}`,
          html: sanctionTemplate(name, kind, account, reason, sanctionEndLabel(sanction.endsAt), `${FRONTEND_URL}/reclamos`),
        },
      });
    } catch (error) {
      this.logger.warn(`No se pudo avisar la sanción ${sanction.id}: ${(error as Error).message}`);
    }
  }
}
