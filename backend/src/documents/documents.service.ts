import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocumentType } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, MAX_DOCUMENT_SIZE_BYTES } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { documentReviewedTemplate, profileVerifiedTemplate } from '../mail/mail.templates';
import {
  DOCUMENT_CATEGORY,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_LABELS,
  EXPIRING_DOCUMENT_TYPES,
  RETIRED_DOCUMENT_TYPES,
  requiredDocumentsFor,
} from './document-requirements';
import type { SecuredFile } from '../uploads/upload-security.service';
import { recomputeDirectoryScore } from '../professionals/directory-score';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  static readonly maxSizeBytes = MAX_DOCUMENT_SIZE_BYTES;

  async upload(userId: string, type: DocumentType, file: SecuredFile, originalFileName: string, issuedAt?: string) {
    if (!Object.values(DocumentType).includes(type)) {
      throw new BadRequestException('Tipo de documento inválido');
    }
    if (RETIRED_DOCUMENT_TYPES.includes(type)) {
      throw new BadRequestException('Este documento ya no se exige');
    }
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');

    const key = this.storage.buildKey(`documents/${profile.id}`, file.extension);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);

    const document = await this.prisma.professionalDocument.create({
      data: {
        professionalId: profile.id,
        type,
        fileKey: key,
        originalFileName: sanitizeFileName(originalFileName, file.extension),
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        issuedAt: issuedAt ? new Date(issuedAt) : undefined,
      },
    });

    if (profile.verificationStatus === 'PENDING') {
      await this.prisma.professionalProfile.update({
        where: { id: profile.id },
        data: { verificationStatus: 'IN_REVIEW' },
      });
    }

    return document;
  }

  async listOwn(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    const documents = await this.prisma.professionalDocument.findMany({
      where: { professionalId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
    const required = requiredDocumentsFor(profile.isSpecialist).map((type) => ({
      type,
      label: DOCUMENT_LABELS[type],
      category: DOCUMENT_CATEGORY[type],
      categoryLabel: DOCUMENT_CATEGORY_LABELS[DOCUMENT_CATEGORY[type]],
    }));
    return { documents, required, verificationStatus: profile.verificationStatus };
  }

  async getOwnDownloadUrl(userId: string, documentId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    const document = await this.prisma.professionalDocument.findUnique({ where: { id: documentId } });
    if (!document || document.professionalId !== profile.id) {
      throw new NotFoundException('Documento no encontrado');
    }
    return { url: await this.storage.getSignedDownloadUrl(document.fileKey) };
  }

  async adminQueue(params: { status?: string; type?: DocumentType; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const where = {
      status: (params.status as never) || undefined,
      type: params.type || undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.professionalDocument.findMany({
        where,
        include: {
          professional: { select: { id: true, firstName: true, lastName: true, slug: true, isSpecialist: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.professionalDocument.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async adminDownloadUrl(documentId: string, adminId: string, ipAddress?: string) {
    const document = await this.prisma.professionalDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Documento no encontrado');
    const url = await this.storage.getSignedDownloadUrl(document.fileKey);
    // Títulos, cédulas y constancias de un tercero: cada descarga queda registrada.
    await this.audit.record({
      userId: adminId,
      action: 'PROFESSIONAL_DOCUMENT_DOWNLOADED',
      resource: 'ProfessionalDocument',
      resourceId: document.id,
      details: { professionalId: document.professionalId, type: document.type },
      ipAddress,
    });
    return { url };
  }

  async adminReview(
    documentId: string,
    adminId: string,
    approved: boolean,
    note: string | undefined,
    expiresAt: string | undefined,
    ipAddress?: string,
  ) {
    const document = await this.prisma.professionalDocument.findUnique({
      where: { id: documentId },
      include: { professional: { include: { user: true } } },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    if (!approved && !note) {
      throw new BadRequestException('Debes indicar un motivo al rechazar un documento');
    }
    if (EXPIRING_DOCUMENT_TYPES.includes(document.type) && approved && !expiresAt) {
      throw new BadRequestException('Este documento requiere fecha de vigencia');
    }

    await this.prisma.professionalDocument.update({
      where: { id: documentId },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewNote: note,
        reviewedById: adminId,
        reviewedAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
    });

    await this.audit.record({
      userId: adminId,
      action: approved ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
      resource: 'ProfessionalDocument',
      resourceId: documentId,
      details: { note, professionalId: document.professionalId },
      ipAddress,
    });

    const dashboardUrl = `${this.config.get('FRONTEND_URL', { infer: true })}/dashboard/documentos`;
    await this.notifications.notify({
      userId: document.professional.userId,
      type: approved ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
      title: approved ? 'Documento aprobado' : 'Documento rechazado',
      content: `${DOCUMENT_LABELS[document.type]}${note ? `: ${note}` : ''}`,
      email: {
        to: document.professional.user.email,
        subject: approved ? 'Documento aprobado — Guía Médica Monagas' : 'Documento rechazado — Guía Médica Monagas',
        html: documentReviewedTemplate(
          document.professional.firstName,
          DOCUMENT_LABELS[document.type],
          approved,
          note,
          dashboardUrl,
        ),
        template: 'document_reviewed',
      },
    });

    await this.recomputeVerification(document.professionalId);
    return { message: 'Documento revisado' };
  }

  /** Recalcula el estado de verificación del perfil según sus documentos vigentes. */
  private async recomputeVerification(professionalId: string) {
    const profile = await this.prisma.professionalProfile.findUniqueOrThrow({
      where: { id: professionalId },
      include: { documents: true, user: true },
    });

    const required = requiredDocumentsFor(profile.isSpecialist);
    const now = new Date();

    const latestByType = new Map<DocumentType, (typeof profile.documents)[number]>();
    for (const doc of profile.documents) {
      const current = latestByType.get(doc.type);
      if (!current || doc.createdAt > current.createdAt) {
        latestByType.set(doc.type, doc);
      }
    }

    const missingOrInvalid: DocumentType[] = [];
    let anyRejected = false;
    for (const type of required) {
      const doc = latestByType.get(type);
      if (!doc || doc.status !== 'APPROVED' || (doc.expiresAt && doc.expiresAt < now)) {
        missingOrInvalid.push(type);
      }
      if (doc?.status === 'REJECTED') anyRejected = true;
    }

    const allApproved = missingOrInvalid.length === 0;
    const wasVerified = profile.verificationStatus === 'VERIFIED';

    const nextStatus = allApproved ? 'VERIFIED' : anyRejected ? 'REJECTED' : 'IN_REVIEW';

    await this.prisma.professionalProfile.update({
      where: { id: professionalId },
      data: {
        verificationStatus: nextStatus,
        isPublished: allApproved,
        verifiedAt: allApproved ? new Date() : profile.verifiedAt,
      },
    });

    // Los números de registro quedan verificados junto con los documentos que los respaldan.
    await this.prisma.professionalRegistration.updateMany({
      where: { professionalId },
      data: { verifiedAt: allApproved ? new Date() : null },
    });
    await recomputeDirectoryScore(this.prisma, professionalId);

    if (allApproved && !wasVerified) {
      const profileUrl = `${this.config.get('FRONTEND_URL', { infer: true })}/medicos/${profile.slug}`;
      await this.notifications.notify({
        userId: profile.userId,
        type: 'PROFILE_VERIFIED',
        title: '¡Tu perfil fue verificado!',
        content: 'Todos tus documentos fueron aprobados. Tu perfil ya es público.',
        email: {
          to: profile.user.email,
          subject: '¡Tu perfil fue verificado! — Guía Médica Monagas',
          html: profileVerifiedTemplate(profile.firstName, profileUrl),
          template: 'profile_verified',
        },
        whatsapp: profile.whatsapp
          ? {
              to: profile.whatsapp,
              template: 'profile_verified',
              body: `¡Felicidades, Dr(a). ${profile.firstName}! Tu perfil en Guía Médica Monagas fue verificado y ya es público: ${profileUrl}`,
            }
          : undefined,
      });
    }
  }

  /** Expira cada día a las 6am los documentos aprobados cuya vigencia venció. */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async expireOutdatedDocuments() {
    const now = new Date();
    const expired = await this.prisma.professionalDocument.findMany({
      where: { status: 'APPROVED', expiresAt: { lt: now } },
    });
    if (expired.length === 0) return;

    const affectedProfessionalIds = new Set(expired.map((d) => d.professionalId));
    await this.prisma.professionalDocument.updateMany({
      where: { id: { in: expired.map((d) => d.id) } },
      data: { status: 'EXPIRED' },
    });

    for (const professionalId of affectedProfessionalIds) {
      await this.recomputeVerification(professionalId);
    }
  }
}

/** Nombre solo para mostrar: sin rutas, sin caracteres de control, con la extensión real. */
export function sanitizeFileName(name: string, extension: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '')
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/\.[^.]*$/, '')
    .slice(0, 80)
    .trim();
  return `${base || 'documento'}.${extension}`;
}
