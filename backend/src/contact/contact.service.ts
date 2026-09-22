import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { contactMessageTemplate } from '../mail/mail.templates';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async submit(dto: CreateContactMessageDto, ipAddress?: string) {
    // Honeypot: los bots suelen rellenar todos los campos, incluido este que
    // se oculta a usuarios reales por CSS. Si viene con valor, fingimos éxito.
    if (dto.website) {
      return { message: 'Mensaje enviado' };
    }

    const professional = await this.prisma.professionalProfile.findUnique({
      where: { slug: dto.professionalSlug },
      include: { user: true },
    });
    if (!professional || !professional.isPublished || professional.verificationStatus !== 'VERIFIED') {
      throw new NotFoundException('Profesional no encontrado');
    }

    await this.prisma.contactMessage.create({
      data: {
        professionalId: professional.id,
        senderName: dto.senderName,
        senderEmail: dto.senderEmail,
        senderPhone: dto.senderPhone,
        content: dto.content,
        ipAddress,
      },
    });

    await this.notifications.notify({
      userId: professional.userId,
      type: 'CONTACT_MESSAGE',
      title: `Nuevo mensaje de ${dto.senderName}`,
      content: dto.content,
      email: {
        to: professional.user.email,
        subject: `Nuevo mensaje de un paciente — Guía Médica Monagas`,
        html: contactMessageTemplate(professional.firstName, dto.senderName, dto.senderEmail, dto.senderPhone, dto.content),
        template: 'contact_message',
      },
    });

    return { message: 'Mensaje enviado' };
  }

  async listOwn(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    return this.prisma.contactMessage.findMany({
      where: { professionalId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(userId: string, id: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    await this.prisma.contactMessage.updateMany({
      where: { id, professionalId: profile.id },
      data: { isRead: true },
    });
    return { message: 'Marcado como leído' };
  }
}
