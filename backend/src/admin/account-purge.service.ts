import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { accountPurgedTemplate, appointmentCancelledTemplate } from '../mail/mail.templates';
import type { ManagedRole } from './account-management.service';
import { caracasDateLabel, caracasTimeLabel } from '../common/caracas-time';
import { recomputeRating } from '../reviews/review-rating';

const UPCOMING_STATUSES = ['PENDING', 'CONFIRMED'] as const;
const OPEN_SUBSCRIPTIONS = ['ACTIVE', 'PENDING', 'PAST_DUE', 'UNPAID'] as const;

interface CancelledAppointmentNotice {
  userId: string;
  email: string;
  name: string;
  startsAt: Date;
  content: string;
  reason: string;
}

/**
 * Eliminación definitiva de una cuenta ya desactivada, suspendida o dada de
 * baja (solo SUPERADMIN). Su correo queda libre para registrarse de nuevo.
 * Cumple la Política de retención y eliminación (/privacidad/retencion): borra los datos personales y
 * los archivos, y conserva solo lo que la ley obliga a guardar:
 *
 * - Pagos y suscripciones (normativa tributaria). Cuelgan del perfil del
 *   médico, así que su cuenta queda como registro anónimo («Cuenta eliminada»).
 * - Autorizaciones que un paciente dio a un médico (evidencia), revocadas.
 *
 * La agenda, las notas clínicas y las finanzas del médico se borran: solo él
 * las veía y la plataforma no es una historia clínica. La cuenta de un
 * paciente se borra; si un médico lo atendió, su ficha queda solo con el
 * código «GMM-XXXX» para que la agenda y la evidencia sigan en pie.
 */
@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger(AccountPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async purge(id: string, role: ManagedRole, reason: string, actorId: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        professionalProfile: { select: { id: true, firstName: true, lastName: true, photoUrl: true, documents: { select: { fileKey: true } } } },
        patientProfile: { select: { id: true, firstName: true } },
      },
    });
    if (!user || user.role !== role || id === actorId || user.purgedAt) throw new NotFoundException('Cuenta no encontrada');
    if (user.isActive) {
      throw new ConflictException('Primero suspende o da de baja la cuenta; la eliminación definitiva solo se aplica a cuentas desactivadas.');
    }
    const owned = await this.prisma.organizationMember.findFirst({
      where: { userId: id, role: 'OWNER' },
      select: { organization: { select: { name: true } } },
    });
    if (owned) {
      throw new ConflictException(`Esta cuenta es dueña de «${owned.organization.name}»: transfiere la propiedad o elimina la organización antes.`);
    }

    const now = new Date();
    const fileKeys: string[] = [];
    const notices: CancelledAppointmentNotice[] = [];
    const professional = user.professionalProfile;

    if (professional) {
      const pending = await this.prisma.payment.count({
        where: { status: 'PENDING', installment: { subscription: { professionalId: professional.id } } },
      });
      if (pending) {
        throw new ConflictException('Este médico tiene un pago reportado pendiente de revisión: apruébalo o recházalo en Pagos antes de eliminar la cuenta.');
      }
      const doctorName = `${professional.firstName} ${professional.lastName}`;
      const upcoming = await this.prisma.appointment.findMany({
        where: { professionalId: professional.id, status: { in: [...UPCOMING_STATUSES] }, startsAt: { gt: now } },
        select: { startsAt: true, patient: { select: { userId: true, firstName: true, user: { select: { email: true, isActive: true } } } } },
      });
      for (const appt of upcoming) {
        const holder = appt.patient.user;
        if (!appt.patient.userId || !holder?.isActive) continue;
        notices.push({
          userId: appt.patient.userId,
          email: holder.email,
          name: appt.patient.firstName ?? 'Paciente',
          startsAt: appt.startsAt,
          content: 'se canceló: el médico ya no está disponible en la plataforma.',
          reason: `Dr(a). ${doctorName} ya no está disponible en Guía Médica Monagas`,
        });
      }
      fileKeys.push(...[professional.photoUrl, ...professional.documents.map((d) => d.fileKey)].filter((k): k is string => !!k));
    } else if (user.patientProfile) {
      const upcoming = await this.prisma.appointment.findMany({
        where: { patientId: user.patientProfile.id, status: { in: [...UPCOMING_STATUSES] }, startsAt: { gt: now } },
        select: {
          startsAt: true,
          patient: { select: { patientCode: true } },
          professional: { select: { userId: true, firstName: true, user: { select: { email: true, isActive: true } } } },
        },
      });
      for (const appt of upcoming) {
        if (!appt.professional.user.isActive) continue;
        notices.push({
          userId: appt.professional.userId,
          email: appt.professional.user.email,
          name: `Dr(a). ${appt.professional.firstName}`,
          startsAt: appt.startsAt,
          content: `(paciente ${appt.patient.patientCode}) se canceló: la cuenta del paciente se eliminó.`,
          reason: 'La cuenta del paciente se eliminó',
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // CAS: nadie la reactivó ni la eliminó mientras tanto.
      const locked = await tx.user.updateMany({
        where: { id, tokenVersion: user.tokenVersion, isActive: false, purgedAt: null },
        data: { tokenVersion: { increment: 1 } },
      });
      if (locked.count !== 1) throw new ConflictException('La cuenta cambió. Actualiza la lista y vuelve a intentarlo.');

      if (professional) await this.scrubProfessional(tx, professional.id, now, fileKeys);
      await this.scrubPatientProfile(tx, id, now, fileKeys);
      // La evidencia de qué textos aceptó se conserva, sin IP ni navegador
      // (la tabla solo admite esta anonimización; ver su migración).
      await tx.legalAcceptance.updateMany({ where: { userId: id }, data: { ipAddress: null, userAgent: null } });

      if (professional) {
        // Registro anónimo: sus pagos (que no se pueden borrar) dependen de él.
        await tx.user.update({
          where: { id },
          data: {
            email: `eliminado-${id}@cuentas.invalid`,
            passwordHash: '!',
            isActive: false,
            isEmailVerified: false,
            // Una cuenta suspendida se elimina sin pasar antes por la baja.
            deletedAt: user.deletedAt ?? now,
            purgedAt: now,
            moderationReason: null,
            lastLoginAt: null,
            lastLoginIp: null,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });
        const byUser = { where: { userId: id } };
        await tx.refreshToken.deleteMany(byUser);
        await tx.verificationToken.deleteMany(byUser);
        await tx.notification.deleteMany(byUser);
        await tx.pushSubscription.deleteMany(byUser);
        await tx.patientVaultSession.deleteMany(byUser);
        await tx.organizationMember.deleteMany(byUser);
      } else {
        await tx.user.delete({ where: { id } });
      }

      await tx.auditLog.create({ data: { userId: actorId, action: 'ACCOUNT_PURGE', resource: 'User', resourceId: id,
        details: { role, reason, previousState: user.deletedAt ? 'DELETED' : 'SUSPENDED', cancelledAppointments: notices.length }, ipAddress } });
    }, { timeout: 30_000 });

    await Promise.all(fileKeys.map((key) => this.storage.deleteObject(key).catch(() => undefined)));
    await this.sendNotices(notices);
    await this.sendFinalNotice(id, user.email, professional ? `Dr(a). ${professional.firstName}` : user.patientProfile?.firstName ?? 'Paciente');
    return { id, purged: true };
  }

  /**
   * Borra todo lo del médico salvo pagos, suscripciones y autorizaciones
   * (revocadas), y vacía su perfil. También borra las fichas sin cuenta que él
   * cargó (walk-in) si ningún otro médico las usa.
   */
  private async scrubProfessional(tx: Prisma.TransactionClient, professionalId: string, now: Date, fileKeys: string[]) {
    const walkIns = await tx.patientProfile.findMany({
      where: {
        createdByProfessionalId: professionalId,
        userId: null,
        appointments: { none: { professionalId: { not: professionalId } } },
        clinicalNotes: { none: { professionalId: { not: professionalId } } },
        registeredBy: { none: { professionalId: { not: professionalId } } },
        dataGrants: { none: { professionalId: { not: professionalId } } },
      },
      select: { id: true, photoKey: true, idPhotoKey: true },
    });
    fileKeys.push(...walkIns.flatMap((w) => [w.photoKey, w.idPhotoKey]).filter((k): k is string => !!k));

    const byProfessional = { where: { professionalId } };
    await tx.appointment.deleteMany(byProfessional); // arrastra sus notas clínicas
    await tx.clinicalNote.deleteMany(byProfessional);
    await tx.financeRecord.deleteMany(byProfessional);
    await tx.patientProfile.deleteMany({ where: { id: { in: walkIns.map((w) => w.id) } } });
    await tx.patientProfile.updateMany({ where: { createdByProfessionalId: professionalId }, data: { createdByProfessionalId: null } });
    await tx.professionalPatient.deleteMany(byProfessional);
    await tx.patientDataGrant.updateMany({ where: { professionalId, revokedAt: null }, data: { revokedAt: now } });
    await tx.professionalDocument.deleteMany(byProfessional);
    await tx.professionalRegistration.deleteMany(byProfessional);
    await tx.professionalSocialLink.deleteMany(byProfessional);
    await tx.professionalSpecialty.deleteMany(byProfessional);
    await tx.professionalLocation.deleteMany(byProfessional);
    await tx.schedule.deleteMany(byProfessional);
    await tx.post.deleteMany(byProfessional);
    await tx.contactMessage.deleteMany(byProfessional);
    await tx.organizationProfessional.deleteMany(byProfessional);
    await tx.review.deleteMany(byProfessional); // arrastra respuestas y denuncias
    await tx.analyticsEvent.deleteMany({ where: { resourceId: professionalId } });
    await tx.subscription.updateMany({
      where: { professionalId, status: { in: [...OPEN_SUBSCRIPTIONS] } },
      data: { status: 'CANCELED', cancelAtPeriodEnd: false },
    });
    await tx.professionalProfile.update({
      where: { id: professionalId },
      data: {
        slug: `cuenta-eliminada-${professionalId}`,
        firstName: 'Cuenta',
        lastName: 'eliminada',
        searchName: '',
        publicCode: null,
        photoUrl: null,
        bio: null,
        presentationVideoId: null,
        mppsNumber: null,
        colmedMonagasNumber: null,
        inpremedicoNumber: null,
        cedula: null,
        rif: null,
        verificationStatus: 'SUSPENDED',
        rejectionReason: null,
        verifiedAt: null,
        isPublished: false,
        isSpecialist: false,
        planTier: 'FREE',
        profileCompleteness: 0,
        directoryScore: 0,
        ratingAverage: null,
        ratingCount: 0,
        phone: null,
        whatsapp: null,
        municipality: null,
        address: null,
        latitude: null,
        longitude: null,
        seoTitle: null,
        seoDescription: null,
        seoKeywords: null,
        ogImageUrl: null,
        noIndex: true,
      },
    });
  }

  /** Borra la ficha de paciente de la cuenta, o la deja solo con su código si un médico la usa. */
  private async scrubPatientProfile(tx: Prisma.TransactionClient, userId: string, now: Date, fileKeys: string[]) {
    const profile = await tx.patientProfile.findUnique({
      where: { userId },
      select: { id: true, photoKey: true, idPhotoKey: true, _count: { select: { appointments: true, clinicalNotes: true, dataGrants: true } } },
    });
    if (!profile) return;
    fileKeys.push(...[profile.photoKey, profile.idPhotoKey].filter((k): k is string => !!k));

    // Sus valoraciones se borran con la cuenta y el promedio de cada médico se recalcula.
    const reviewed = await tx.review.findMany({ where: { patientId: profile.id }, select: { professionalId: true } });
    if (reviewed.length) {
      await tx.review.deleteMany({ where: { patientId: profile.id } });
      for (const professionalId of new Set(reviewed.map((r) => r.professionalId))) await recomputeRating(tx, professionalId);
    }

    const { appointments, clinicalNotes, dataGrants } = profile._count;
    if (appointments + clinicalNotes + dataGrants === 0) {
      await tx.patientProfile.delete({ where: { id: profile.id } });
      return;
    }
    const upcoming = { patientId: profile.id, status: { in: [...UPCOMING_STATUSES] }, startsAt: { gt: now } };
    const cancelled = await tx.appointment.findMany({ where: upcoming, select: { id: true } });
    await tx.appointment.updateMany({
      where: upcoming,
      data: { status: 'CANCELLED', cancelledAt: now, cancelledBy: 'PATIENT', cancellationReason: 'La cuenta del paciente se eliminó' },
    });
    // Queda en el historial de cada cita: la canceló la administración al eliminar la cuenta.
    if (cancelled.length) {
      await tx.appointmentEvent.createMany({
        data: cancelled.map((appointment) => ({ appointmentId: appointment.id, type: 'CANCELLED' as const, actor: 'ADMIN' as const, createdAt: now })),
      });
    }
    await tx.professionalPatient.deleteMany({ where: { patientId: profile.id } });
    await tx.patientDataGrant.updateMany({ where: { patientId: profile.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.patientProfile.update({
      where: { id: profile.id },
      data: {
        userId: null,
        firstName: null,
        lastName: null,
        municipality: null,
        cedulaEnc: null,
        cedulaLookup: null,
        phoneEnc: null,
        phoneLookup: null,
        healthDataEnc: null,
        photoKey: null,
        idPhotoKey: null,
        identityStatus: 'PENDING',
        identityReviewNote: null,
        identityReviewedAt: null,
        identityReviewedById: null,
        shareCodeEnc: null,
        shareCodeLookup: null,
        shareCodeCreatedAt: null,
      },
    });
  }

  private async sendNotices(notices: CancelledAppointmentNotice[]) {
    for (const notice of notices) {
      const dateLabel = caracasDateLabel(notice.startsAt);
      const timeLabel = caracasTimeLabel(notice.startsAt);
      await this.notifications
        .notify({
          userId: notice.userId,
          type: 'APPOINTMENT_CANCELLED',
          title: 'Cita cancelada',
          content: `Tu cita del ${dateLabel} ${timeLabel} ${notice.content}`,
          email: {
            to: notice.email,
            subject: 'Cita cancelada — Guía Médica Monagas',
            template: 'appointment_cancelled',
            html: appointmentCancelledTemplate(notice.name, { dateLabel, timeLabel, reason: notice.reason }, 'el equipo de Guía Médica Monagas'),
          },
        })
        .catch((error: Error) => this.logger.warn(`Aviso de cita cancelada no enviado: ${error.message}`));
    }
  }

  /**
   * Último correo al titular. Después se anonimiza el registro de envíos de
   * esa cuenta (incluido este), que guardaba su correo o teléfono.
   */
  private async sendFinalNotice(userId: string, email: string, name: string) {
    await this.mail.send({
      to: email,
      subject: 'Tu cuenta fue eliminada — Guía Médica Monagas',
      html: accountPurgedTemplate(name),
      template: 'account_purged',
      relatedUserId: userId,
    });
    await this.prisma.messageLog.updateMany({
      where: { relatedUserId: userId },
      data: { recipient: 'cuenta eliminada', errorMessage: null },
    });
  }
}
