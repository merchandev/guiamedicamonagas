import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContactRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CONTACT_REQUEST_CONSENT_VERSION } from '../common/legal-versions';
import { tierAtLeast } from '../subscriptions/plan-tiers';
import { formatPhone } from '../crypto/field-encryption.service';
import { PatientDataCodec } from '../patients/patient-data.codec';
import { contactRequestTemplate } from '../mail/mail.templates';
import type { CreateContactRequestDto } from './dto/contact-request.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Días que el médico puede ver los datos de un pedido. */
export const CONTACT_REQUEST_DAYS = 30;
/** Pedidos nuevos por paciente en 24 horas. */
const DAILY_LIMIT = 5;
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const DOCTOR_LINK = '/dashboard/mensajes';
const PATIENT_LINK = '/paciente/contactos';
const ACTIVE: ContactRequestStatus[] = ['OPEN', 'CONTACTED', 'CLOSED'];

/** Lo que queda de un pedido retirado o vencido: el registro, sin los datos que compartió. */
const ERASED: Prisma.ContactMessageUpdateManyMutationInput = {
  senderName: 'Datos borrados',
  senderEmail: '',
  senderPhone: null,
  content: '',
  preferredTime: null,
};

/** «María G.»: lo que dice el aviso al médico (nunca el nombre completo fuera del pedido). */
function shortName(firstName: string | null, lastName: string | null): string | null {
  const first = firstName?.trim().split(/\s+/)[0];
  const initial = lastName?.trim().charAt(0).toLocaleUpperCase('es-VE');
  return first && initial ? `${first} ${initial}.` : null;
}

/**
 * «Quiero que me contacte»: el paciente con sesión elige qué compartir con un
 * médico (nombre, teléfono o WhatsApp, correo, horario y un mensaje) y acepta
 * un texto versionado. El médico ve esos datos solo dentro del pedido, durante
 * 30 días o hasta que el paciente lo retire; después se borran. Es la
 * alternativa con consentimiento a avisarle quién lo encontró en una búsqueda.
 */
@Injectable()
export class ContactRequestsService {
  private readonly logger = new Logger(ContactRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly codec: PatientDataCodec,
  ) {}

  async create(userId: string, dto: CreateContactRequestDto, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, isEmailVerified: true, patientProfile: true },
    });
    if (!user?.isEmailVerified) throw new ForbiddenException('Verifica tu correo para pedir que un médico te contacte');

    const professional = await this.prisma.professionalProfile.findUnique({
      where: { slug: dto.professionalSlug },
      select: { id: true, userId: true, firstName: true, lastName: true, isPublished: true, planTier: true },
    });
    if (!professional?.isPublished) throw new NotFoundException('Profesional no encontrado');
    // Igual que el formulario de la ficha: solo los planes que reciben mensajes.
    if (!tierAtLeast(professional.planTier, 'PROFESSIONAL_PLUS')) {
      throw new ForbiddenException('Este profesional aún no recibe mensajes desde la plataforma');
    }

    if (dto.channel === 'EMAIL' && !dto.shareEmail) throw new BadRequestException('Para que te escriba, comparte tu correo');
    if ((dto.channel === 'PHONE' || dto.channel === 'WHATSAPP') && !dto.phone) {
      throw new BadRequestException('Para que te llame o te escriba por WhatsApp, comparte un teléfono');
    }

    const profile = user.patientProfile;
    const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
    if (dto.shareName && !name) throw new BadRequestException('Completa tu nombre en tu perfil para compartirlo');

    const open = await this.prisma.contactMessage.findFirst({
      where: { patientUserId: userId, professionalId: professional.id, requestStatus: { in: ['OPEN', 'CONTACTED'] } },
      select: { id: true },
    });
    if (open) throw new ConflictException('Ya tienes un pedido de contacto abierto con este médico');
    const recent = await this.prisma.contactMessage.count({
      where: { patientUserId: userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (recent >= DAILY_LIMIT) {
      throw new HttpException('Llegaste al máximo de pedidos de contacto por día; intenta de nuevo mañana', HttpStatus.TOO_MANY_REQUESTS);
    }

    const now = new Date();
    const request = await this.prisma.contactMessage.create({
      data: {
        professionalId: professional.id,
        patientUserId: userId,
        senderName: dto.shareName ? name : 'Paciente',
        senderEmail: dto.shareEmail ? user.email : '',
        senderPhone: dto.phone ? formatPhone(dto.phone) : null,
        content: dto.message,
        preferredChannel: dto.channel,
        preferredTime: dto.preferredTime || null,
        identityVerified: profile?.identityStatus === 'VERIFIED',
        consentVersion: CONTACT_REQUEST_CONSENT_VERSION,
        requestStatus: 'OPEN',
        expiresAt: new Date(now.getTime() + CONTACT_REQUEST_DAYS * DAY_MS),
        statusChangedAt: now,
        ipAddress,
      },
    });
    await this.audit.record({
      userId,
      action: 'CONTACT_REQUEST_CREATED',
      resource: 'ContactMessage',
      resourceId: request.id,
      details: { professionalId: professional.id, channel: dto.channel, shareName: dto.shareName, shareEmail: dto.shareEmail, phone: !!dto.phone },
      ipAddress,
    });

    // Ni el aviso ni el correo llevan los datos: el médico los ve en el pedido.
    const doctor = await this.prisma.user.findUnique({ where: { id: professional.userId }, select: { email: true } });
    const label = dto.shareName ? shortName(profile?.firstName ?? null, profile?.lastName ?? null) : null;
    await this.notifications.notify({
      userId: professional.userId,
      type: 'CONTACT_REQUEST',
      title: label ? `Pedido de contacto de ${label}` : 'Nuevo pedido de contacto de un paciente',
      content: 'Abre el pedido para ver los datos que compartió y su forma de contacto preferida.',
      link: DOCTOR_LINK,
      email: doctor && {
        to: doctor.email,
        subject: 'Nuevo pedido de contacto — Guía Médica Monagas',
        html: contactRequestTemplate(`${professional.firstName} ${professional.lastName}`, CONTACT_REQUEST_DAYS, `${FRONTEND_URL}${DOCTOR_LINK}`),
        template: 'contact-request',
      },
    });
    return { id: request.id, status: request.requestStatus, expiresAt: request.expiresAt };
  }

  /** Los pedidos del paciente, con lo que compartió y su estado. */
  async listMine(userId: string) {
    const rows = await this.prisma.contactMessage.findMany({
      where: { patientUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        senderName: true,
        senderEmail: true,
        senderPhone: true,
        content: true,
        preferredChannel: true,
        preferredTime: true,
        identityVerified: true,
        requestStatus: true,
        createdAt: true,
        expiresAt: true,
        statusChangedAt: true,
        professional: { select: { slug: true, firstName: true, lastName: true } },
      },
    });
    return rows.map(({ professional, ...row }) => ({
      ...row,
      professional: { slug: professional.slug, name: `${professional.firstName} ${professional.lastName}` },
    }));
  }

  /** El paciente lo retira cuando quiera: el médico deja de ver sus datos al instante. */
  async withdraw(userId: string, id: string, ipAddress?: string) {
    const request = await this.prisma.contactMessage.findFirst({
      where: { id, patientUserId: userId },
      select: { id: true, requestStatus: true, professional: { select: { userId: true } } },
    });
    if (!request?.requestStatus) throw new NotFoundException('Pedido no encontrado');
    if (!ACTIVE.includes(request.requestStatus)) throw new ConflictException('El pedido ya se retiró o venció');
    const changed = await this.prisma.contactMessage.updateMany({
      where: { id, requestStatus: { in: ACTIVE } },
      data: { ...ERASED, requestStatus: 'WITHDRAWN', statusChangedAt: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('El pedido ya se retiró o venció');
    await this.audit.record({ userId, action: 'CONTACT_REQUEST_WITHDRAWN', resource: 'ContactMessage', resourceId: id, ipAddress });
    await this.notifications.notify({
      userId: request.professional.userId,
      type: 'CONTACT_REQUEST_WITHDRAWN',
      title: 'Un paciente retiró su pedido de contacto',
      content: 'Sus datos ya no están disponibles.',
      link: DOCTOR_LINK,
    });
    return { status: 'WITHDRAWN' as const };
  }

  /** El médico lo marca como contactado o lo cierra; los datos siguen visibles hasta que venza. */
  async setStatus(doctorUserId: string, id: string, status: 'CONTACTED' | 'CLOSED', ipAddress?: string) {
    const request = await this.prisma.contactMessage.findFirst({
      where: { id, professional: { userId: doctorUserId } },
      select: { id: true, requestStatus: true, patientUserId: true, professional: { select: { firstName: true, lastName: true } } },
    });
    if (!request?.requestStatus) throw new NotFoundException('Pedido no encontrado');
    const from: ContactRequestStatus[] = status === 'CONTACTED' ? ['OPEN'] : ['OPEN', 'CONTACTED'];
    const changed = await this.prisma.contactMessage.updateMany({
      where: { id, requestStatus: { in: from } },
      data: { requestStatus: status, statusChangedAt: new Date(), isRead: true },
    });
    if (changed.count !== 1) throw new ConflictException('El pedido cambió de estado. Actualiza la lista.');
    await this.audit.record({
      userId: doctorUserId,
      action: `CONTACT_REQUEST_${status}`,
      resource: 'ContactMessage',
      resourceId: id,
      ipAddress,
    });
    if (status === 'CONTACTED' && request.patientUserId) {
      await this.notifications.notify({
        userId: request.patientUserId,
        type: 'CONTACT_REQUEST_CONTACTED',
        title: 'El médico atendió tu pedido de contacto',
        content: `Dr(a). ${request.professional.firstName} ${request.professional.lastName} lo marcó como contactado.`,
        link: PATIENT_LINK,
      });
    }
    return { status };
  }

  /** Cada hora: los pedidos de más de 30 días vencen y se borran los datos que compartió el paciente. */
  @Cron(CronExpression.EVERY_HOUR)
  async expireOldRequests() {
    const result = await this.prisma.contactMessage.updateMany({
      where: { requestStatus: { in: ACTIVE }, expiresAt: { lte: new Date() } },
      data: { ...ERASED, requestStatus: 'EXPIRED', statusChangedAt: new Date() },
    });
    if (result.count) this.logger.log(`Pedidos de contacto vencidos: ${result.count}`);
  }

  /** Teléfono de la ficha del paciente, para precargar el pedido (solo él lo ve). */
  async prefill(userId: string) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, isEmailVerified: true } });
    return {
      name: [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || null,
      phone: profile ? this.codec.decodePhone(profile) : null,
      email: user?.email ?? null,
      emailVerified: !!user?.isEmailVerified,
      identityVerified: profile?.identityStatus === 'VERIFIED',
      consentVersion: CONTACT_REQUEST_CONSENT_VERSION,
      days: CONTACT_REQUEST_DAYS,
    };
  }
}
