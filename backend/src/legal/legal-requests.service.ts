import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { LegalRequestCategory, LegalRequestStatus, Prisma } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { legalRequestReceivedTemplate, legalRequestUpdatedTemplate } from '../mail/mail.templates';
import { Permission } from '../common/permissions';
import { CreateLegalRequestDto, ListLegalRequestsDto, LookupLegalRequestDto, UpdateLegalRequestDto } from './legal-request.dto';

export const LEGAL_REQUEST_CATEGORY_LABELS: Record<LegalRequestCategory, string> = {
  PRIVACY_RIGHTS: 'Derechos sobre mis datos (acceso, copia, corrección)',
  ACCOUNT_DELETION: 'Cierre y eliminación de mi cuenta',
  UNAUTHORIZED_ACCESS: 'Acceso indebido a datos',
  FALSE_IDENTITY: 'Identidad falsa o suplantación',
  FALSE_CREDENTIAL: 'Título o credencial falsa',
  SUSPENDED_PROFESSIONAL: 'Profesional suspendido o inhabilitado',
  MISLEADING_CONTENT: 'Publicidad o contenido engañoso',
  SECURITY: 'Seguridad o vulnerabilidad',
  BILLING: 'Pagos, cobros o reembolsos',
  INTELLECTUAL_PROPERTY: 'Propiedad intelectual',
  AUTHORITY_REQUEST: 'Requerimiento de una autoridad',
  OTHER: 'Otra solicitud',
};

export const LEGAL_REQUEST_STATUS_LABELS: Record<LegalRequestStatus, string> = {
  OPEN: 'Recibida',
  IN_REVIEW: 'En revisión',
  RESOLVED: 'Resuelta',
  REJECTED: 'No procede',
};

const TICKET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAGE_SIZE = 20;

function newTicket() {
  let code = '';
  for (let i = 0; i < 8; i += 1) code += TICKET_ALPHABET[randomInt(TICKET_ALPHABET.length)];
  return `R-${code}`;
}

@Injectable()
export class LegalRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private statusUrl(ticket: string) {
    return `${this.config.get('FRONTEND_URL', { infer: true })}/reclamos/estado?solicitud=${encodeURIComponent(ticket)}`;
  }

  /** Con sesión, la solicitud queda a nombre de la cuenta y usa su correo. */
  async create(dto: CreateLegalRequestDto, ipAddress?: string, userId?: string) {
    let email = dto.requesterEmail?.toLowerCase();
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      email = user?.email ?? email;
    }
    if (!email) throw new BadRequestException('Escribe tu correo para poder responderte');

    let created: { id: string; ticket: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        created = await this.prisma.legalRequest.create({
          data: {
            ticket: newTicket(),
            category: dto.category,
            requesterName: dto.requesterName,
            requesterEmail: email,
            requesterPhone: dto.requesterPhone ?? null,
            subjectUrl: dto.subjectUrl ?? null,
            description: dto.description,
            userId: userId ?? null,
            ipAddress: ipAddress ?? null,
          },
          select: { id: true, ticket: true },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
    if (!created) throw new Error('No se pudo generar el número de solicitud');

    await this.audit.record({
      userId,
      action: 'LEGAL_REQUEST_CREATED',
      resource: 'LegalRequest',
      resourceId: created.id,
      details: { ticket: created.ticket, category: dto.category },
      ipAddress,
    });
    await this.mail.send({
      to: email,
      subject: `Recibimos tu solicitud ${created.ticket} — Guía Médica Monagas`,
      template: 'legal_request_received',
      relatedUserId: userId,
      html: legalRequestReceivedTemplate(dto.requesterName, created.ticket, LEGAL_REQUEST_CATEGORY_LABELS[dto.category], this.statusUrl(created.ticket)),
    });
    // Aviso en el panel de quienes atienden las solicitudes; un fallo no pierde la solicitud.
    await this.notifications.notifyStaff(Permission.MANAGE_LEGAL_REQUESTS, {
      type: 'LEGAL_REQUEST_CREATED',
      title: `Nueva solicitud ${created.ticket}`,
      content: `${LEGAL_REQUEST_CATEGORY_LABELS[dto.category]}. Atiéndela en Administración → Solicitudes legales.`,
      link: '/admin/solicitudes',
    });
    return { ticket: created.ticket, status: 'OPEN' as const };
  }

  /** Estado público de una solicitud: exige el número y el correo con que se envió. */
  async lookup(dto: LookupLegalRequestDto) {
    const request = await this.prisma.legalRequest.findUnique({
      where: { ticket: dto.ticket.toUpperCase() },
      select: { ticket: true, category: true, status: true, requesterEmail: true, createdAt: true, resolvedAt: true, resolution: true },
    });
    if (!request || request.requesterEmail !== dto.email.toLowerCase()) {
      throw new NotFoundException('No encontramos una solicitud con ese número y ese correo');
    }
    const { requesterEmail: _email, ...rest } = request;
    return rest;
  }

  async listOwn(userId: string) {
    return this.prisma.legalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { ticket: true, category: true, status: true, createdAt: true, resolvedAt: true, resolution: true },
    });
  }

  async list(query: ListLegalRequestsDto, actorId: string, ipAddress?: string) {
    const where: Prisma.LegalRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const page = query.page ?? 1;
    const [items, total, open] = await this.prisma.$transaction([
      this.prisma.legalRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { resolvedBy: { select: { email: true } } },
      }),
      this.prisma.legalRequest.count({ where }),
      this.prisma.legalRequest.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    ]);
    await this.audit.record({
      userId: actorId,
      action: 'LEGAL_REQUESTS_LISTED',
      resource: 'LegalRequest',
      details: { page, count: items.length, status: query.status ?? null, category: query.category ?? null },
      ipAddress,
    });
    return { items, total, open, page, totalPages: Math.ceil(total / PAGE_SIZE) };
  }

  async update(id: string, dto: UpdateLegalRequestDto, actorId: string, ipAddress?: string) {
    const current = await this.prisma.legalRequest.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Solicitud no encontrada');
    const closing = dto.status === 'RESOLVED' || dto.status === 'REJECTED';
    const resolution = dto.resolution?.trim() || null;
    if (closing && (!resolution || resolution.length < 10)) {
      throw new BadRequestException('Escribe la respuesta para el solicitante (mínimo 10 caracteres)');
    }
    const updated = await this.prisma.legalRequest.update({
      where: { id },
      data: {
        status: dto.status,
        resolution: resolution ?? current.resolution,
        resolvedAt: closing ? new Date() : null,
        resolvedById: closing ? actorId : null,
      },
    });
    await this.audit.record({
      userId: actorId,
      action: 'LEGAL_REQUEST_UPDATED',
      resource: 'LegalRequest',
      resourceId: id,
      details: { ticket: current.ticket, from: current.status, to: dto.status },
      ipAddress,
    });
    if (current.status !== dto.status) {
      await this.mail.send({
        to: current.requesterEmail,
        subject: `Tu solicitud ${current.ticket}: ${LEGAL_REQUEST_STATUS_LABELS[dto.status]} — Guía Médica Monagas`,
        template: 'legal_request_updated',
        relatedUserId: current.userId ?? undefined,
        html: legalRequestUpdatedTemplate(
          current.requesterName,
          current.ticket,
          LEGAL_REQUEST_STATUS_LABELS[dto.status],
          closing ? resolution : null,
          this.statusUrl(current.ticket),
        ),
      });
    }
    return updated;
  }
}
