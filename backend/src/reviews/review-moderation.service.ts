import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma, ReviewStatus } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VENEZUELA_TIME_ZONE } from '../common/caracas-time';
import { reviewModeratedTemplate, reviewReplyModeratedTemplate, type ReviewModerationKind } from '../mail/mail.templates';
import { normalizeForFilter } from './review-filter';
import { recomputeRating } from './review-rating';
import { PATIENT_PANEL_LINK, ReviewsService } from './reviews.service';
import { SanctionsService } from './sanctions.service';
import type { ModerateReplyDto, ModerationListDto, ModerationTab, ResolveReportDto } from './dto/moderation.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 20;
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const DOCTOR_PANEL_LINK = '/dashboard/valoraciones';

const QUEUE_SELECT = {
  id: true,
  rating: true,
  comment: true,
  flags: true,
  status: true,
  basis: true,
  consultationMonth: true,
  authorDisplay: true,
  publishedAt: true,
  moderatedAt: true,
  moderationNote: true,
  createdAt: true,
  updatedAt: true,
  patientId: true,
  professional: { select: { id: true, slug: true, firstName: true, lastName: true } },
  reply: { select: { id: true, content: true, status: true, flags: true, moderationNote: true, updatedAt: true } },
  _count: { select: { reports: { where: { status: 'OPEN' } } } },
} satisfies Prisma.ReviewSelect;

type QueueRow = Prisma.ReviewGetPayload<{ select: typeof QUEUE_SELECT }>;

type ActionReview = Prisma.ReviewGetPayload<{
  include: {
    professional: { select: { id: true; userId: true; firstName: true; lastName: true } };
    patient: { select: { userId: true; firstName: true } };
    reports: { where: { status: 'OPEN' }; select: { id: true; reporterId: true } };
  };
}>;

function tabWhere(tab: ModerationTab): Prisma.ReviewWhereInput {
  if (tab === 'REPLIES') return { reply: { status: 'PENDING' } };
  if (tab === 'REPORTED') return { reports: { some: { status: 'OPEN' } } };
  return { status: tab };
}

/**
 * Moderación de valoraciones (permiso MODERATE_REVIEWS): la cola sin la
 * identidad del autor; abrir un caso la muestra y queda en la auditoría.
 * Retirar quita la valoración del sitio y la guarda como evidencia (con
 * REVIEW_EVIDENCE_RETENTION_DAYS se borra al vencer el plazo); eliminar la
 * borra para siempre. Cada decisión avisa al autor con el motivo.
 */
@Injectable()
export class ReviewModerationService {
  private readonly logger = new Logger(ReviewModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly reviews: ReviewsService,
    private readonly sanctions: SanctionsService,
  ) {}

  private present(row: QueueRow) {
    const { _count, professional, patientId: _patientId, ...rest } = row;
    return {
      ...rest,
      professional: { id: professional.id, slug: professional.slug, name: `${professional.firstName} ${professional.lastName}` },
      openReports: _count.reports,
    };
  }

  async list(dto: ModerationListDto) {
    const tab = dto.tab ?? 'PENDING';
    const page = dto.page ?? 1;
    const search = dto.search ? normalizeForFilter(dto.search).trim() : '';
    const where: Prisma.ReviewWhereInput = {
      ...tabWhere(tab),
      ...(dto.rating ? { rating: dto.rating } : {}),
      ...(search ? { professional: { searchName: { contains: search } } } : {}),
    };
    // Lo que espera una decisión, del más antiguo al más nuevo; el resto, al revés.
    const waiting = tab === 'PENDING' || tab === 'REPLIES' || tab === 'REPORTED';
    const [rows, total, pending, replies, reported] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        select: QUEUE_SELECT,
        orderBy: [{ updatedAt: waiting ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.count({ where: tabWhere('PENDING') }),
      this.prisma.review.count({ where: tabWhere('REPLIES') }),
      this.prisma.review.count({ where: tabWhere('REPORTED') }),
    ]);
    return {
      items: rows.map((row) => this.present(row)),
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
      counts: { PENDING: pending, REPLIES: replies, REPORTED: reported },
    };
  }

  /**
   * El caso completo sin la identidad del autor: el texto, el médico, la
   * respuesta, las denuncias, el estado de la cuenta del autor, cuántas
   * valoraciones tiene y sus sanciones. Quién es (nombre, código y a qué otros
   * médicos valoró) se ve aparte, con la bóveda de pacientes abierta (author()).
   */
  async case(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: {
        ...QUEUE_SELECT,
        professional: { select: { id: true, slug: true, firstName: true, lastName: true, userId: true } },
        patient: { select: { id: true, userId: true } },
        reports: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            reason: true,
            details: true,
            status: true,
            createdAt: true,
            resolvedAt: true,
            resolutionNote: true,
            reporter: { select: { professionalProfile: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });
    if (!review) throw new NotFoundException('Valoración no encontrada');

    const authorUserId = review.patient.userId;
    const [account, byStatus, authorSanctions, doctorSanctions] = await Promise.all([
      authorUserId
        ? this.prisma.user.findUnique({ where: { id: authorUserId }, select: { isActive: true, deletedAt: true, suspendedUntil: true } })
        : null,
      this.prisma.review.groupBy({ by: ['status'], where: { patientId: review.patient.id }, _count: { _all: true } }),
      authorUserId ? this.sanctions.listForUser(authorUserId) : [],
      this.sanctions.listForUser(review.professional.userId),
    ]);

    const { patient, reports, professional, ...rest } = review;
    return {
      ...this.present({ ...rest, professional } as QueueRow),
      reports: reports.map((report) => ({
        ...report,
        reporter: report.reporter.professionalProfile
          ? `Dr(a). ${report.reporter.professionalProfile.firstName} ${report.reporter.professionalProfile.lastName}`
          : 'Médico',
      })),
      author: {
        userId: authorUserId,
        patientId: patient.id,
        account,
        reviews: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Partial<Record<ReviewStatus, number>>,
        sanctions: authorSanctions,
      },
      doctor: {
        userId: professional.userId,
        name: `${professional.firstName} ${professional.lastName}`,
        sanctions: doctorSanctions,
      },
    };
  }

  /**
   * Quién escribió la valoración y a qué otros médicos valoró. Solo con la
   * bóveda de pacientes abierta (PatientVaultGuard) y queda en la auditoría
   * (REVIEW_AUTHOR_VIEWED).
   */
  async author(id: string, adminId: string, ipAddress?: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: {
        id: true,
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, identityStatus: true } },
      },
    });
    if (!review) throw new NotFoundException('Valoración no encontrada');
    const otherReviews = await this.prisma.review.findMany({
      where: { patientId: review.patient.id, id: { not: review.id } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, rating: true, status: true, createdAt: true, professional: { select: { firstName: true, lastName: true } } },
    });
    await this.audit.record({ userId: adminId, action: 'REVIEW_AUTHOR_VIEWED', resource: 'Review', resourceId: review.id, ipAddress });
    const { patient } = review;
    return {
      patientCode: patient.patientCode,
      name: [patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Sin nombre',
      identityStatus: patient.identityStatus,
      otherReviews: otherReviews.map((other) => ({
        id: other.id,
        rating: other.rating,
        status: other.status,
        createdAt: other.createdAt,
        professional: `${other.professional.firstName} ${other.professional.lastName}`,
      })),
    };
  }

  // --- Decisiones sobre la valoración ----------------------------------------

  private async loadForAction(id: string): Promise<ActionReview> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        professional: { select: { id: true, userId: true, firstName: true, lastName: true } },
        patient: { select: { userId: true, firstName: true } },
        reports: { where: { status: 'OPEN' }, select: { id: true, reporterId: true } },
      },
    });
    if (!review) throw new NotFoundException('Valoración no encontrada');
    return review;
  }

  /** Cambia el estado solo si sigue siendo el esperado: dos moderadores a la vez no se pisan. */
  private async transition(
    review: ActionReview,
    from: ReviewStatus[],
    to: ReviewStatus,
    adminId: string,
    note: string | null,
    extra: (tx: Prisma.TransactionClient) => Promise<void> = async () => undefined,
  ) {
    if (!from.includes(review.status)) throw new ConflictException('La valoración cambió de estado. Actualiza la lista.');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.review.updateMany({
        where: { id: review.id, status: { in: from } },
        data: {
          status: to,
          moderatedAt: now,
          moderatedById: adminId,
          moderationNote: note,
          ...(to === 'PUBLISHED' ? { publishedAt: now } : {}),
        },
      });
      if (changed.count !== 1) throw new ConflictException('La valoración cambió de estado. Actualiza la lista.');
      await recomputeRating(tx, review.professionalId);
      await extra(tx);
    });
  }

  async approve(id: string, adminId: string, ipAddress?: string) {
    const review = await this.loadForAction(id);
    await this.transition(review, ['PENDING'], 'PUBLISHED', adminId, null);
    await this.audit.record({ userId: adminId, action: 'REVIEW_APPROVED', resource: 'Review', resourceId: id, ipAddress });
    await this.reviews.notifyDoctorPublished(review.professional);
    await this.notifyAuthorPublished(review);
    return { status: 'PUBLISHED' as const };
  }

  async reject(id: string, reason: string, adminId: string, ipAddress?: string) {
    const review = await this.loadForAction(id);
    await this.transition(review, ['PENDING'], 'REJECTED', adminId, reason);
    await this.audit.record({ userId: adminId, action: 'REVIEW_REJECTED', resource: 'Review', resourceId: id, details: { reason }, ipAddress });
    await this.notifyAuthor(review, 'REJECTED', reason);
    return { status: 'REJECTED' as const };
  }

  /** Quita una publicada del sitio y la guarda, sin publicar, como evidencia. Las denuncias abiertas quedan procedentes. */
  async withdraw(id: string, reason: string, adminId: string, ipAddress?: string) {
    const review = await this.loadForAction(id);
    await this.transition(review, ['PUBLISHED'], 'WITHDRAWN', adminId, reason, (tx) => this.upholdReports(tx, review.id, adminId, reason));
    await this.audit.record({ userId: adminId, action: 'REVIEW_WITHDRAWN', resource: 'Review', resourceId: id, details: { reason }, ipAddress });
    await this.notifyAuthor(review, 'WITHDRAWN', reason);
    await this.notifyDoctorRemoved(review, 'retiró');
    return { status: 'WITHDRAWN' as const };
  }

  async restore(id: string, adminId: string, ipAddress?: string) {
    const review = await this.loadForAction(id);
    await this.transition(review, ['WITHDRAWN', 'REJECTED'], 'PUBLISHED', adminId, null);
    await this.audit.record({ userId: adminId, action: 'REVIEW_RESTORED', resource: 'Review', resourceId: id, ipAddress });
    await this.reviews.notifyDoctorPublished(review.professional);
    await this.notifyAuthorPublished(review);
    return { status: 'PUBLISHED' as const };
  }

  /** Borrado definitivo (p. ej. datos de salud de otra persona): en la auditoría queda el motivo, no el texto. */
  async remove(id: string, reason: string, adminId: string, ipAddress?: string) {
    const review = await this.loadForAction(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: review.id } });
      await recomputeRating(tx, review.professionalId);
    });
    await this.audit.record({
      userId: adminId,
      action: 'REVIEW_DELETED_BY_ADMIN',
      resource: 'Review',
      resourceId: id,
      details: { reason, previousStatus: review.status, professionalId: review.professionalId, patientId: review.patientId },
      ipAddress,
    });
    await this.notifyAuthor(review, 'DELETED', reason);
    await this.notifyDoctorRemoved(review, 'eliminó');
    return { deleted: true };
  }

  /** Retira todas las publicadas del autor y rechaza las que esperaban revisión. */
  async withdrawAllByAuthor(patientId: string, reason: string, adminId: string, ipAddress?: string) {
    const reviews = await this.prisma.review.findMany({
      where: { patientId, status: { in: ['PUBLISHED', 'PENDING'] } },
      select: { id: true, status: true, professionalId: true },
    });
    if (!reviews.length) throw new NotFoundException('El autor no tiene valoraciones publicadas ni en revisión');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const moderation = { moderatedAt: now, moderatedById: adminId, moderationNote: reason };
      await tx.review.updateMany({ where: { patientId, status: 'PUBLISHED' }, data: { status: 'WITHDRAWN', ...moderation } });
      await tx.review.updateMany({ where: { patientId, status: 'PENDING' }, data: { status: 'REJECTED', ...moderation } });
      for (const review of reviews) await this.upholdReports(tx, review.id, adminId, reason);
      for (const professionalId of new Set(reviews.map((review) => review.professionalId))) await recomputeRating(tx, professionalId);
    }, { timeout: 30_000 });
    await this.audit.record({
      userId: adminId,
      action: 'REVIEW_AUTHOR_WITHDRAWN_ALL',
      resource: 'PatientProfile',
      resourceId: patientId,
      details: { reason, reviews: reviews.length },
      ipAddress,
    });
    const author = await this.prisma.patientProfile.findUnique({ where: { id: patientId }, select: { userId: true, firstName: true } });
    if (author?.userId) await this.sendAuthorNotice(author.userId, author.firstName, 'WITHDRAWN', reason);
    return {
      withdrawn: reviews.filter((review) => review.status === 'PUBLISHED').length,
      rejected: reviews.filter((review) => review.status === 'PENDING').length,
    };
  }

  private async upholdReports(tx: Prisma.TransactionClient, reviewId: string, adminId: string, note: string) {
    await tx.reviewReport.updateMany({
      where: { reviewId, status: 'OPEN' },
      data: { status: 'UPHELD', resolvedAt: new Date(), resolvedById: adminId, resolutionNote: note },
    });
  }

  // --- Respuestas del médico -------------------------------------------------

  async moderateReply(reviewId: string, dto: ModerateReplyDto, adminId: string, ipAddress?: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { reply: true, professional: { select: { userId: true, firstName: true, lastName: true } } },
    });
    if (!review?.reply) throw new NotFoundException('Respuesta no encontrada');
    const rules: Record<ModerateReplyDto['action'], { from: ReviewStatus[]; to: ReviewStatus; needsReason: boolean }> = {
      APPROVE: { from: ['PENDING'], to: 'PUBLISHED', needsReason: false },
      REJECT: { from: ['PENDING'], to: 'REJECTED', needsReason: true },
      WITHDRAW: { from: ['PUBLISHED'], to: 'WITHDRAWN', needsReason: true },
      RESTORE: { from: ['REJECTED', 'WITHDRAWN'], to: 'PUBLISHED', needsReason: false },
    };
    const rule = rules[dto.action];
    if (rule.needsReason && !dto.reason) throw new BadRequestException('Escribe el motivo: lo recibe el médico');
    const now = new Date();
    const changed = await this.prisma.reviewReply.updateMany({
      where: { id: review.reply.id, status: { in: rule.from } },
      data: {
        status: rule.to,
        moderatedAt: now,
        moderatedById: adminId,
        moderationNote: rule.needsReason ? dto.reason : null,
        ...(rule.to === 'PUBLISHED' ? { publishedAt: now } : {}),
      },
    });
    if (changed.count !== 1) throw new ConflictException('La respuesta cambió de estado. Actualiza la lista.');
    await this.audit.record({
      userId: adminId,
      action: `REVIEW_REPLY_${dto.action}`,
      resource: 'ReviewReply',
      resourceId: review.reply.id,
      details: dto.reason ? { reason: dto.reason } : undefined,
      ipAddress,
    });

    const doctorName = `${review.professional.firstName} ${review.professional.lastName}`;
    if (rule.to === 'PUBLISHED') {
      await this.notifications.notify({
        userId: review.professional.userId,
        type: 'REVIEW_REPLY_MODERATED',
        title: 'Tu respuesta se publicó',
        content: 'Tu respuesta a una opinión ya se ve en tu ficha.',
        link: DOCTOR_PANEL_LINK,
      });
    } else {
      const withdrawn = rule.to === 'WITHDRAWN';
      const user = await this.prisma.user.findUnique({ where: { id: review.professional.userId }, select: { email: true } });
      await this.notifications.notify({
        userId: review.professional.userId,
        type: 'REVIEW_REPLY_MODERATED',
        title: withdrawn ? 'Retiramos tu respuesta' : 'Tu respuesta no se publicó',
        content: `Motivo: ${dto.reason}`,
        link: DOCTOR_PANEL_LINK,
        email: user && {
          to: user.email,
          subject: `${withdrawn ? 'Retiramos tu respuesta' : 'Tu respuesta no se publicó'} — Guía Médica Monagas`,
          template: withdrawn ? 'review-reply-withdrawn' : 'review-reply-rejected',
          html: reviewReplyModeratedTemplate(doctorName, withdrawn, dto.reason!, `${FRONTEND_URL}${DOCTOR_PANEL_LINK}`),
        },
      });
    }
    return { status: rule.to };
  }

  // --- Denuncias -------------------------------------------------------------

  async resolveReport(reportId: string, dto: ResolveReportDto, adminId: string, ipAddress?: string) {
    const report = await this.prisma.reviewReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Denuncia no encontrada');
    const changed = await this.prisma.reviewReport.updateMany({
      where: { id: reportId, status: 'OPEN' },
      data: { status: dto.status, resolvedAt: new Date(), resolvedById: adminId, resolutionNote: dto.note },
    });
    if (changed.count !== 1) throw new ConflictException('La denuncia ya se resolvió');
    await this.audit.record({
      userId: adminId,
      action: 'REVIEW_REPORT_RESOLVED',
      resource: 'ReviewReport',
      resourceId: reportId,
      details: { status: dto.status, note: dto.note },
      ipAddress,
    });
    await this.notifications.notify({
      userId: report.reporterId,
      type: 'REVIEW_REPORT_RESOLVED',
      title: dto.status === 'UPHELD' ? 'Tu denuncia fue procedente' : 'Revisamos tu denuncia',
      content: dto.status === 'UPHELD' ? `Respuesta: ${dto.note}` : `La opinión se mantiene. Respuesta: ${dto.note}`,
      link: DOCTOR_PANEL_LINK,
    });
    return { status: dto.status };
  }

  // --- Avisos ----------------------------------------------------------------

  private async notifyAuthorPublished(review: ActionReview) {
    if (!review.patient.userId) return;
    await this.notifications.notify({
      userId: review.patient.userId,
      type: 'REVIEW_MODERATED',
      title: 'Tu opinión se publicó',
      content: `Tu opinión sobre Dr(a). ${review.professional.firstName} ${review.professional.lastName} ya se ve en su ficha.`,
      link: PATIENT_PANEL_LINK,
    });
  }

  private async notifyAuthor(review: ActionReview, kind: ReviewModerationKind, reason: string) {
    if (review.patient.userId) await this.sendAuthorNotice(review.patient.userId, review.patient.firstName, kind, reason);
  }

  private async sendAuthorNotice(userId: string, firstName: string | null, kind: ReviewModerationKind, reason: string) {
    const titles: Record<ReviewModerationKind, string> = {
      REJECTED: 'Tu opinión no se publicó',
      WITHDRAWN: 'Retiramos tu opinión',
      DELETED: 'Eliminamos tu opinión',
    };
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    await this.notifications.notify({
      userId,
      type: 'REVIEW_MODERATED',
      title: titles[kind],
      content: `Motivo: ${reason}`,
      link: PATIENT_PANEL_LINK,
      email: user && {
        to: user.email,
        subject: `${titles[kind]} — Guía Médica Monagas`,
        template: `review-${kind.toLowerCase()}`,
        html: reviewModeratedTemplate(firstName ?? 'Paciente', kind, reason, `${FRONTEND_URL}${PATIENT_PANEL_LINK}`, `${FRONTEND_URL}/reclamos`),
      },
    });
  }

  /** Al médico: si había denunciado la opinión, que se le dio la razón; si no, que salió de su ficha. */
  private async notifyDoctorRemoved(review: ActionReview, verb: 'retiró' | 'eliminó') {
    const reported = review.reports.some((report) => report.reporterId === review.professional.userId);
    await this.notifications.notify({
      userId: review.professional.userId,
      type: 'REVIEW_REMOVED',
      title: reported ? 'Tu denuncia fue procedente' : 'Se quitó una opinión de tu ficha',
      content: reported
        ? `La administración ${verb} la opinión que denunciaste.`
        : `La administración ${verb} una opinión de tu ficha porque no cumple las reglas.`,
      link: DOCTOR_PANEL_LINK,
    });
  }

  // --- Evidencia -------------------------------------------------------------

  /**
   * Borra las valoraciones y respuestas rechazadas o retiradas cuyo plazo de
   * evidencia venció (REVIEW_EVIDENCE_RETENTION_DAYS). Vacío: no se borra nada
   * hasta que el titular fije el plazo con su abogado y lo declare.
   */
  @Cron('40 3 * * *', { timeZone: VENEZUELA_TIME_ZONE })
  async purgeExpiredEvidence() {
    const days = this.config.get('REVIEW_EVIDENCE_RETENTION_DAYS', { infer: true });
    if (!days) return;
    const cutoff = new Date(Date.now() - days * DAY_MS);
    const stale = { status: { in: ['REJECTED', 'WITHDRAWN'] as ReviewStatus[] }, moderatedAt: { lt: cutoff } };
    const [reviews, replies] = await this.prisma.$transaction([
      this.prisma.review.deleteMany({ where: stale }),
      this.prisma.reviewReply.deleteMany({ where: stale }),
    ]);
    if (reviews.count || replies.count) {
      this.logger.log(`Evidencia vencida borrada: ${reviews.count} valoración(es) y ${replies.count} respuesta(s)`);
    }
  }
}
