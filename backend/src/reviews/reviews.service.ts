import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ReviewAuthorDisplay, ReviewBasis, ReviewStatus } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Permission } from '../common/permissions';
import { REVIEW_RULES_VERSION } from '../common/legal-versions';
import { caracasMonthKey } from '../common/caracas-time';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { patientCompleteness, PatientCompleteness } from '../patients/patient-completeness';
import { reviewPublishedTemplate } from '../mail/mail.templates';
import { cleanText, reviewFlags } from './review-filter';
import { MIN_REVIEWS_FOR_AVERAGE, publicRating, recomputeRating } from './review-rating';
import { activeSanctionWhere, sanctionUntilText } from './sanction-rules';
import { CreateReviewDto, ReportReviewDto, UpdateReviewDto } from './dto/reviews.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Valoraciones nuevas por paciente en 24 horas. */
export const DAILY_REVIEW_LIMIT = 3;
const PAGE_SIZE = 10;
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const DOCTOR_PANEL_LINK = '/dashboard/valoraciones';
export const PATIENT_PANEL_LINK = '/paciente/valoraciones';
const ADMIN_LINK = '/admin/valoraciones';

export type IdentityState = 'MISSING' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface Consultation {
  basis: ReviewBasis;
  month: string;
}

const PROFESSIONAL_CARD_SELECT = {
  id: true,
  slug: true,
  firstName: true,
  lastName: true,
  isPublished: true,
  specialties: { select: { specialty: { select: { name: true } } }, take: 1 },
} satisfies Prisma.ProfessionalProfileSelect;

const PUBLIC_REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  authorDisplay: true,
  basis: true,
  consultationMonth: true,
  patient: { select: { firstName: true, lastName: true } },
  reply: { select: { content: true, status: true } },
} satisfies Prisma.ReviewSelect;

type PublicReviewRow = Prisma.ReviewGetPayload<{ select: typeof PUBLIC_REVIEW_SELECT }>;

/** «Paciente verificado» o, si el autor lo eligió, nombre e inicial del apellido («María G.»). */
export function authorLabel(display: ReviewAuthorDisplay, firstName: string | null, lastName: string | null): string {
  const first = firstName?.trim().split(/\s+/)[0];
  const initial = lastName?.trim().charAt(0).toLocaleUpperCase('es-VE');
  if (display === 'INITIAL' && first && initial) return `${first} ${initial}.`;
  return 'Paciente verificado';
}

/**
 * Valoraciones de pacientes. Quién puede valorar lo decide este servicio, no
 * la pantalla: cuenta de paciente con el correo verificado y la mayoría de
 * edad declarada, registro al 100 % (patientCompleteness), cédula aprobada y
 * una consulta verificada con ese médico (cita realizada en la plataforma o
 * registro con el código del paciente). Todo comentario y toda respuesta pasan
 * por moderación previa; las valoraciones sin comentario se publican al
 * enviarlas. Con REVIEWS_ENABLED=false nada de esto responde.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  get enabled(): boolean {
    return this.config.get('REVIEWS_ENABLED', { infer: true }) === true;
  }

  private assertEnabled() {
    if (!this.enabled) throw new NotFoundException('Las valoraciones aún no están disponibles');
  }

  publicConfig() {
    return { enabled: this.enabled, minForAverage: MIN_REVIEWS_FOR_AVERAGE };
  }

  // --- Requisitos del paciente ----------------------------------------------

  private async patientContext(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isEmailVerified: true, isActive: true, deletedAt: true, patientProfile: true },
    });
    const profile = user?.patientProfile ?? null;
    const completeness: PatientCompleteness = patientCompleteness(profile, !!user?.isEmailVerified);
    const adult = !!(await this.prisma.legalAcceptance.findFirst({
      where: { userId, document: 'AGE_DECLARATION' },
      select: { id: true },
    }));
    const identity: IdentityState = !profile
      ? 'MISSING'
      : profile.identityStatus === 'PENDING' && !profile.idPhotoKey
        ? 'MISSING'
        : profile.identityStatus;

    const blockers: string[] = [];
    if (!user?.isActive || user.deletedAt) blockers.push('Tu cuenta no está activa');
    if (completeness.percent < 100) {
      const missing = completeness.items.filter((item) => !item.done).map((item) => item.label.toLocaleLowerCase('es-VE'));
      blockers.push(`Completa tu registro (${completeness.percent} %): falta ${missing.join(', ')}`);
    }
    // Sin foto de la cédula ya lo dice el registro incompleto.
    if (identity === 'PENDING') {
      blockers.push('Tu cédula está en revisión: podrás valorar cuando la aprueben');
    } else if (identity === 'REJECTED') {
      blockers.push('No pudimos verificar tu cédula: sube una foto nueva desde tu perfil');
    }
    if (!adult) blockers.push('Debes declarar que eres mayor de edad');
    const sanctionUntil = await this.reviewSanctionUntil(userId);
    if (sanctionUntil !== undefined) {
      blockers.push(`No puedes escribir ni editar opiniones ${sanctionUntilText(sanctionUntil)} por una sanción de la administración`);
    }

    return {
      profile,
      requirements: {
        completeness,
        identity,
        emailVerified: !!user?.isEmailVerified,
        adult,
        canReview: blockers.length === 0,
        blockers,
      },
    };
  }

  /**
   * Fin de la sanción de opiniones vigente (null si es indefinida) o
   * undefined si no tiene ninguna. Con varias, manda la que dura más.
   */
  private async reviewSanctionUntil(userId: string): Promise<Date | null | undefined> {
    const sanctions = await this.prisma.userSanction.findMany({
      where: activeSanctionWhere(userId, 'REVIEWS'),
      select: { endsAt: true },
    });
    if (!sanctions.length) return undefined;
    if (sanctions.some((sanction) => sanction.endsAt === null)) return null;
    return new Date(Math.max(...sanctions.map((sanction) => sanction.endsAt!.getTime())));
  }

  /** Médicos publicados con los que el paciente tiene una consulta verificada, y de qué mes. */
  private async consultations(patientId: string): Promise<Map<string, Consultation>> {
    const [completed, registered] = await Promise.all([
      this.prisma.appointment.findMany({
        // Realizada y ya pasada: marcar como realizada una cita futura no habilita a opinar.
        where: { patientId, status: 'COMPLETED', startsAt: { lte: new Date() }, professional: { isPublished: true } },
        orderBy: { startsAt: 'desc' },
        select: { professionalId: true, startsAt: true },
      }),
      this.prisma.professionalPatient.findMany({
        where: { patientId, professional: { isPublished: true } },
        orderBy: { createdAt: 'desc' },
        select: { professionalId: true, createdAt: true },
      }),
    ]);
    const map = new Map<string, Consultation>();
    for (const row of completed) {
      if (!map.has(row.professionalId)) map.set(row.professionalId, { basis: 'APPOINTMENT', month: caracasMonthKey(row.startsAt) });
    }
    for (const row of registered) {
      if (!map.has(row.professionalId)) map.set(row.professionalId, { basis: 'REGISTERED', month: caracasMonthKey(row.createdAt) });
    }
    return map;
  }

  /** «Mis valoraciones»: requisitos, médicos que puede valorar y sus opiniones con su estado. */
  async mine(userId: string) {
    this.assertEnabled();
    const { profile, requirements } = await this.patientContext(userId);
    if (!profile) return { requirements, authorPreview: null, doctors: [] };

    const [consultations, reviews] = await Promise.all([
      this.consultations(profile.id),
      this.prisma.review.findMany({
        where: { patientId: profile.id },
        select: {
          id: true,
          professionalId: true,
          rating: true,
          comment: true,
          authorDisplay: true,
          status: true,
          moderationNote: true,
          basis: true,
          consultationMonth: true,
          publishedAt: true,
          updatedAt: true,
          reply: { select: { content: true, status: true } },
        },
      }),
    ]);
    const ids = [...new Set([...consultations.keys(), ...reviews.map((review) => review.professionalId)])];
    const professionals = await this.prisma.professionalProfile.findMany({
      where: { id: { in: ids } },
      select: PROFESSIONAL_CARD_SELECT,
    });
    const byId = new Map(professionals.map((p) => [p.id, p]));

    const doctors = ids
      .map((id) => {
        const professional = byId.get(id);
        if (!professional) return null;
        const review = reviews.find((r) => r.professionalId === id) ?? null;
        const consultation = consultations.get(id) ?? null;
        return {
          professional: {
            id: professional.id,
            slug: professional.slug,
            name: `${professional.firstName} ${professional.lastName}`,
            specialty: professional.specialties[0]?.specialty.name ?? null,
            isPublished: professional.isPublished,
          },
          consultation,
          review: review && {
            id: review.id,
            rating: review.rating,
            comment: review.comment,
            authorDisplay: review.authorDisplay,
            status: review.status,
            moderationNote: review.moderationNote,
            consultationMonth: review.consultationMonth,
            publishedAt: review.publishedAt,
            updatedAt: review.updatedAt,
            reply: review.reply?.status === 'PUBLISHED' ? { content: review.reply.content } : null,
          },
        };
      })
      .filter((doctor): doctor is NonNullable<typeof doctor> => doctor !== null)
      .sort((a, b) => a.professional.name.localeCompare(b.professional.name, 'es'));

    // Cómo se vería su nombre si elige mostrarlo («María G.»).
    const authorPreview = authorLabel('INITIAL', profile.firstName, profile.lastName);
    return { requirements, authorPreview: authorPreview === 'Paciente verificado' ? null : authorPreview, doctors };
  }

  private async ownReviewOrThrow(userId: string, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, patient: { userId } },
      include: { professional: { select: { id: true, userId: true, firstName: true, lastName: true } } },
    });
    if (!review) throw new NotFoundException('Valoración no encontrada');
    return review;
  }

  async create(userId: string, dto: CreateReviewDto, ipAddress?: string) {
    this.assertEnabled();
    const { profile, requirements } = await this.patientContext(userId);
    if (!profile || !requirements.canReview) {
      throw new ForbiddenException(requirements.blockers[0] ?? 'Aún no cumples los requisitos para valorar');
    }
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: dto.professionalId },
      select: { id: true, userId: true, firstName: true, lastName: true, isPublished: true },
    });
    if (!professional?.isPublished) throw new NotFoundException('Médico no encontrado');
    const consultation = (await this.consultations(profile.id)).get(professional.id);
    if (!consultation) {
      throw new ForbiddenException(
        'Solo puedes valorar a un médico con el que tuviste una consulta verificada: una cita realizada en la plataforma o que te haya registrado con tu código',
      );
    }
    const recent = await this.prisma.review.count({
      where: { patientId: profile.id, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (recent >= DAILY_REVIEW_LIMIT) {
      throw new HttpException('Llegaste al máximo de valoraciones por día; intenta de nuevo mañana', HttpStatus.TOO_MANY_REQUESTS);
    }

    const comment = cleanText(dto.comment);
    const status: ReviewStatus = comment ? 'PENDING' : 'PUBLISHED';
    let review;
    try {
      review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: {
            professionalId: professional.id,
            patientId: profile.id,
            basis: consultation.basis,
            consultationMonth: consultation.month,
            rating: dto.rating,
            comment,
            authorDisplay: dto.authorDisplay,
            status,
            flags: reviewFlags(comment),
            rulesVersion: REVIEW_RULES_VERSION,
            publishedAt: status === 'PUBLISHED' ? new Date() : null,
          },
        });
        if (status === 'PUBLISHED') await recomputeRating(tx, professional.id);
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Ya valoraste a este médico: puedes editar tu opinión');
      throw error;
    }

    await this.audit.record({
      userId,
      action: 'REVIEW_CREATED',
      resource: 'Review',
      resourceId: review.id,
      details: { professionalId: professional.id, status },
      ipAddress,
    });
    await this.afterSubmit(review.status, professional);
    return { id: review.id, status: review.status };
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto, ipAddress?: string) {
    this.assertEnabled();
    const review = await this.ownReviewOrThrow(userId, reviewId);
    if (review.status === 'WITHDRAWN') {
      throw new ForbiddenException('La administración retiró esta valoración: no se puede editar');
    }
    const { requirements } = await this.patientContext(userId);
    if (!requirements.canReview) {
      throw new ForbiddenException(requirements.blockers[0] ?? 'Aún no cumples los requisitos para valorar');
    }

    const comment = dto.comment !== undefined ? cleanText(dto.comment) : review.comment;
    const status: ReviewStatus = comment ? 'PENDING' : 'PUBLISHED';
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({
        where: { id: review.id },
        data: {
          rating: dto.rating ?? review.rating,
          comment,
          authorDisplay: dto.authorDisplay ?? review.authorDisplay,
          status,
          flags: reviewFlags(comment),
          rulesVersion: REVIEW_RULES_VERSION,
          publishedAt: status === 'PUBLISHED' ? new Date() : null,
          moderatedAt: null,
          moderatedById: null,
          moderationNote: null,
        },
      });
      await recomputeRating(tx, review.professionalId);
      return saved;
    });

    await this.audit.record({
      userId,
      action: 'REVIEW_UPDATED',
      resource: 'Review',
      resourceId: review.id,
      details: { status },
      ipAddress,
    });
    await this.afterSubmit(updated.status, review.professional);
    return { id: updated.id, status: updated.status };
  }

  /** El autor borra su valoración (salvo una retirada, que se guarda como evidencia). */
  async remove(userId: string, reviewId: string, ipAddress?: string) {
    this.assertEnabled();
    const review = await this.ownReviewOrThrow(userId, reviewId);
    if (review.status === 'WITHDRAWN') {
      throw new ForbiddenException('La administración retiró esta valoración: se conserva y no se puede borrar');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: review.id } });
      await recomputeRating(tx, review.professionalId);
    });
    await this.audit.record({
      userId,
      action: 'REVIEW_DELETED_BY_AUTHOR',
      resource: 'Review',
      resourceId: review.id,
      details: { professionalId: review.professionalId, status: review.status },
      ipAddress,
    });
    return { ok: true };
  }

  private async afterSubmit(
    status: ReviewStatus,
    professional: { id: string; userId: string; firstName: string; lastName: string },
  ) {
    if (status === 'PUBLISHED') {
      await this.notifyDoctorPublished(professional);
      return;
    }
    // Sin el nombre del autor ni del médico: quien modera lo ve en la cola.
    await this.notifications.notifyStaff(Permission.MODERATE_REVIEWS, {
      type: 'REVIEW_PENDING',
      title: 'Valoración por revisar',
      content: 'Un paciente envió una valoración con comentario.',
      link: ADMIN_LINK,
    });
  }

  async notifyDoctorPublished(professional: { userId: string; firstName: string; lastName: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: professional.userId }, select: { email: true } });
    await this.notifications.notify({
      userId: professional.userId,
      type: 'REVIEW_PUBLISHED',
      title: 'Tienes una opinión nueva',
      content: 'Se publicó en tu ficha la opinión de un paciente con consulta verificada.',
      link: DOCTOR_PANEL_LINK,
      email: user && {
        to: user.email,
        subject: 'Tienes una opinión nueva en Guía Médica Monagas',
        html: reviewPublishedTemplate(`${professional.firstName} ${professional.lastName}`, `${FRONTEND_URL}${DOCTOR_PANEL_LINK}`),
        template: 'review-published',
      },
    });
  }

  // --- Lo público -----------------------------------------------------------

  private publicReview(row: PublicReviewRow) {
    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      author: authorLabel(row.authorDisplay, row.patient.firstName, row.patient.lastName),
      basis: row.basis,
      consultationMonth: row.consultationMonth,
      reply: row.reply?.status === 'PUBLISHED' ? { content: row.reply.content } : null,
    };
  }

  private async summary(professionalId: string, average: number | null, count: number) {
    const rating = publicRating(average, count);
    if (rating.average === null) return { ...rating, distribution: null };
    const groups = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { professionalId, status: 'PUBLISHED' },
      _count: { _all: true },
    });
    const distribution = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: groups.find((group) => group.rating === stars)?._count._all ?? 0,
    }));
    return { ...rating, distribution };
  }

  async publicList(slug: string, page = 1) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { slug },
      select: { id: true, isPublished: true, ratingAverage: true, ratingCount: true },
    });
    if (!professional?.isPublished) throw new NotFoundException('Profesional no encontrado');
    if (!this.enabled) return { enabled: false as const };

    const where: Prisma.ReviewWhereInput = { professionalId: professional.id, status: 'PUBLISHED' };
    const [rows, total, summary] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: PUBLIC_REVIEW_SELECT,
      }),
      this.prisma.review.count({ where }),
      this.summary(professional.id, professional.ratingAverage, professional.ratingCount),
    ]);
    return {
      enabled: true as const,
      summary,
      items: rows.map((row) => this.publicReview(row)),
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
    };
  }

  // --- El médico ------------------------------------------------------------

  private async ownProfessionalOrThrow(userId: string) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, slug: true, ratingAverage: true, ratingCount: true, isPublished: true },
    });
    if (!professional) throw new NotFoundException('Perfil profesional no encontrado');
    return professional;
  }

  /** Lo mismo que ve el público, más el estado de su respuesta y de sus denuncias. Nunca quién es un autor anónimo. */
  async forDoctor(userId: string, page = 1) {
    this.assertEnabled();
    const professional = await this.ownProfessionalOrThrow(userId);
    const where: Prisma.ReviewWhereInput = { professionalId: professional.id, status: 'PUBLISHED' };
    const [rows, total, summary] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          ...PUBLIC_REVIEW_SELECT,
          reply: { select: { content: true, status: true, moderationNote: true, updatedAt: true } },
          reports: { where: { reporterId: userId }, select: { reason: true, status: true, createdAt: true } },
        },
      }),
      this.prisma.review.count({ where }),
      this.summary(professional.id, professional.ratingAverage, professional.ratingCount),
    ]);
    return {
      slug: professional.slug,
      isPublished: professional.isPublished,
      summary,
      items: rows.map((row) => ({
        ...this.publicReview(row),
        reply: row.reply,
        report: row.reports[0] ?? null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
    };
  }

  private async doctorReviewOrThrow(userId: string, reviewId: string) {
    const professional = await this.ownProfessionalOrThrow(userId);
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, professionalId: professional.id, status: 'PUBLISHED' },
      include: { reply: true },
    });
    if (!review) throw new NotFoundException('Valoración no encontrada');
    return review;
  }

  /** Una sola respuesta pública por valoración; editarla la devuelve a moderación. */
  async upsertReply(userId: string, reviewId: string, rawContent: string, ipAddress?: string) {
    this.assertEnabled();
    const review = await this.doctorReviewOrThrow(userId, reviewId);
    if (review.reply?.status === 'WITHDRAWN') {
      throw new ForbiddenException('La administración retiró tu respuesta: no se puede editar');
    }
    const sanctionUntil = await this.reviewSanctionUntil(userId);
    if (sanctionUntil !== undefined) {
      throw new ForbiddenException(`No puedes responder opiniones ${sanctionUntilText(sanctionUntil)} por una sanción de la administración`);
    }
    const content = cleanText(rawContent);
    if (!content) throw new BadRequestException('Escribe tu respuesta');
    const data = {
      content,
      status: 'PENDING' as const,
      flags: reviewFlags(content),
      publishedAt: null,
      moderatedAt: null,
      moderatedById: null,
      moderationNote: null,
    };
    const reply = await this.prisma.reviewReply.upsert({
      where: { reviewId: review.id },
      create: { reviewId: review.id, ...data },
      update: data,
    });
    await this.audit.record({
      userId,
      action: review.reply ? 'REVIEW_REPLY_UPDATED' : 'REVIEW_REPLY_CREATED',
      resource: 'ReviewReply',
      resourceId: reply.id,
      ipAddress,
    });
    await this.notifications.notifyStaff(Permission.MODERATE_REVIEWS, {
      type: 'REVIEW_REPLY_PENDING',
      title: 'Respuesta por revisar',
      content: 'Un médico respondió una valoración.',
      link: ADMIN_LINK,
    });
    return { status: reply.status };
  }

  async removeReply(userId: string, reviewId: string, ipAddress?: string) {
    this.assertEnabled();
    const review = await this.doctorReviewOrThrow(userId, reviewId);
    if (!review.reply) throw new NotFoundException('No hay respuesta');
    if (review.reply.status === 'WITHDRAWN') {
      throw new ForbiddenException('La administración retiró tu respuesta: se conserva y no se puede borrar');
    }
    await this.prisma.reviewReply.delete({ where: { id: review.reply.id } });
    await this.audit.record({
      userId,
      action: 'REVIEW_REPLY_DELETED',
      resource: 'ReviewReply',
      resourceId: review.reply.id,
      ipAddress,
    });
    return { ok: true };
  }

  /** El médico denuncia una valoración suya: va a la cola de la administración. No la oculta. */
  async report(userId: string, reviewId: string, dto: ReportReviewDto, ipAddress?: string) {
    this.assertEnabled();
    const review = await this.doctorReviewOrThrow(userId, reviewId);
    let report;
    try {
      report = await this.prisma.reviewReport.create({
        data: { reviewId: review.id, reporterId: userId, reason: dto.reason, details: cleanText(dto.details) },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Ya denunciaste esta valoración; la administración la está revisando');
      throw error;
    }
    await this.audit.record({
      userId,
      action: 'REVIEW_REPORTED',
      resource: 'Review',
      resourceId: review.id,
      details: { reason: dto.reason },
      ipAddress,
    });
    await this.notifications.notifyStaff(Permission.MODERATE_REVIEWS, {
      type: 'REVIEW_REPORTED',
      title: 'Valoración denunciada',
      content: 'Un médico denunció una valoración publicada.',
      link: ADMIN_LINK,
    });
    return { id: report.id, status: report.status };
  }
}
