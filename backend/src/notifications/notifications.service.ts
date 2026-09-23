import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

interface NotifyOptions {
  userId: string;
  type: string;
  title: string;
  content: string;
  email?: {
    to: string;
    subject: string;
    html: string;
    template: string;
    attachments?: { filename: string; content: string; contentType: string }[];
  };
  whatsapp?: { to: string; template: string; body: string };
}

/**
 * Punto único para notificar a un usuario: crea la notificación in-app y,
 * si se indican, dispara correo y/o WhatsApp en paralelo (best-effort).
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async notify(options: NotifyOptions): Promise<void> {
    const tasks: Promise<unknown>[] = [
      this.prisma.notification.create({
        data: {
          userId: options.userId,
          type: options.type,
          title: options.title,
          content: options.content,
        },
      }),
    ];

    if (options.email) {
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

  async listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
