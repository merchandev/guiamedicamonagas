import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Role } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { Permission, ROLE_PERMISSIONS } from '../common/permissions';
import { VENEZUELA_TIME_ZONE } from '../common/caracas-time';
import { isInternalLink, OPTIONAL_EMAIL_TYPES, optionalEmailTypesFor } from './notification-types';

interface NotifyOptions {
  userId: string;
  type: string;
  title: string;
  content: string;
  /** Ruta interna del sitio a la que lleva el aviso (p. ej. «/dashboard/citas»). */
  link?: string;
  email?: {
    to: string;
    subject: string;
    html: string;
    template: string;
    attachments?: { filename: string; content: string | Buffer; contentType: string }[];
  };
  whatsapp?: { to: string; template: string; body: string };
}

type StaffNotice = Pick<NotifyOptions, 'type' | 'title' | 'content' | 'link'>;

const PAGE_SIZE = 20;

/**
 * Punto único para notificar a un usuario: crea el aviso interno (la campana)
 * y, si se indican, dispara correo y/o WhatsApp en paralelo (best-effort).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async notify(options: NotifyOptions): Promise<void> {
    const tasks: Promise<unknown>[] = [
      this.prisma.notification.create({
        data: {
          userId: options.userId,
          type: options.type,
          title: options.title,
          content: options.content,
          link: isInternalLink(options.link) ? options.link : null,
        },
      }),
    ];

    if (options.email && !(await this.emailOptedOut(options.userId, options.type))) {
      tasks.push(
        this.mail.send({
          to: options.email.to,
          subject: options.email.subject,
          html: options.email.html,
          template: options.email.template,
          relatedUserId: options.userId,
          attachments: options.email.attachments,
        }),
      );
    }

    if (options.whatsapp) {
      tasks.push(
        this.whatsapp.sendText(
          options.whatsapp.to,
          options.whatsapp.template,
          options.whatsapp.body,
          options.userId,
        ),
      );
    }

    await Promise.allSettled(tasks);
  }

  /**
   * Aviso interno (sin correo) a quienes tienen el permiso de esa tarea:
   * documentos por revisar, identidades, pagos, solicitudes legales…
   * Un fallo nunca interrumpe la acción que lo origina.
   */
  async notifyStaff(permission: Permission, notice: StaffNotice): Promise<void> {
    try {
      const roles = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) => ROLE_PERMISSIONS[role].includes(permission));
      const staff = await this.prisma.user.findMany({
        where: { role: { in: roles }, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!staff.length) return;
      await this.prisma.notification.createMany({
        data: staff.map((member) => ({
          userId: member.id,
          type: notice.type,
          title: notice.title,
          content: notice.content,
          link: isInternalLink(notice.link) ? notice.link : null,
        })),
      });
    } catch (error) {
      this.logger.warn(`No se pudo avisar a la administración (${notice.type}): ${(error as Error).message}`);
    }
  }

  private async emailOptedOut(userId: string, type: string): Promise<boolean> {
    if (!OPTIONAL_EMAIL_TYPES[type]) return false;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationEmailOptOut: true } });
    return !!user?.notificationEmailOptOut.includes(type);
  }

  /** Del más nuevo al más viejo, de a 20 (o `limit`), con cursor. */
  async listForUser(userId: string, cursor?: string, limit = PAGE_SIZE) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, type: true, title: true, content: true, link: true, isRead: true, readAt: true, createdAt: true },
    });
    // El filtro por usuario manda: con cualquier cursor solo salen avisos propios.
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, isRead: false } }) };
  }

  async markAsRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /** Correos opcionales que corresponden a su tipo de cuenta y si los recibe. */
  /** Los correos opcionales de su tipo de cuenta, sin los de funciones apagadas (valoraciones, récipes). */
  private offeredEmailTypes(role: Role): string[] {
    return optionalEmailTypesFor(role).filter((type) => {
      const feature = OPTIONAL_EMAIL_TYPES[type].feature;
      return !feature || this.config.get(feature, { infer: true }) === true;
    });
  }

  async preferences(userId: string, role: Role) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationEmailOptOut: true } });
    const optedOut = new Set(user?.notificationEmailOptOut ?? []);
    return {
      email: this.offeredEmailTypes(role).map((type) => ({
        type,
        label: OPTIONAL_EMAIL_TYPES[type].label,
        enabled: !optedOut.has(type),
      })),
    };
  }

  async updatePreferences(userId: string, role: Role, emailOptOut: string[]) {
    const allowed = new Set(this.offeredEmailTypes(role));
    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationEmailOptOut: [...new Set(emailOptOut)].filter((type) => allowed.has(type)) },
    });
    return this.preferences(userId, role);
  }

  /**
   * Borra los avisos leídos más viejos que NOTIFICATION_RETENTION_DAYS.
   * Sin esa variable no se borra nada (el plazo lo decide el titular y se
   * declara en la política de retención).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: VENEZUELA_TIME_ZONE })
  async purgeOldReadNotifications() {
    const days = this.config.get('NOTIFICATION_RETENTION_DAYS', { infer: true });
    if (!days) return;
    const before = new Date(Date.now() - days * 86_400_000);
    const { count } = await this.prisma.notification.deleteMany({ where: { isRead: true, createdAt: { lt: before } } });
    if (count) this.logger.log(`Avisos leídos de más de ${days} días borrados: ${count}`);
  }
}
