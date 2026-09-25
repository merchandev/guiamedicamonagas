import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, PatientDataScope, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgendaService } from '../agenda/agenda.service';
import { PatientsService } from '../patients/patients.service';
import { PatientDataCodec } from '../patients/patient-data.codec';
import { NotificationsService } from '../notifications/notifications.service';
import { AGENDA_MIN_TIER, tierAtLeast } from '../subscriptions/plan-tiers';
import {
  appointmentCancelledTemplate,
  appointmentConfirmedTemplate,
  appointmentRequestedPatientTemplate,
  appointmentRequestedProfessionalTemplate,
  appointmentRescheduledTemplate,
} from '../mail/mail.templates';
import { buildAppointmentIcs } from './ics.util';
import { computeAvailableSlots, endOfCaracasDay, startOfCaracasDay, toVetDateKey } from './availability.util';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CreateManualAppointmentDto } from './dto/create-manual-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';

const DATE_LABEL_FMT: Intl.DateTimeFormatOptions = { dateStyle: 'full' };
const TIME_LABEL_FMT: Intl.DateTimeFormatOptions = { timeStyle: 'short' };
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly patients: PatientsService,
    private readonly notifications: NotificationsService,
    private readonly codec: PatientDataCodec,
  ) {}

  // --- Disponibilidad (público) ----------------------------------------

  async getAvailability(professionalId: string, fromDateKey: string, toDateKey: string) {
    const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
    if (!professionalId || !DATE_KEY_PATTERN.test(fromDateKey ?? '') || !DATE_KEY_PATTERN.test(toDateKey ?? '')) {
      throw new BadRequestException('professionalId, from y to son obligatorios (from/to en formato AAAA-MM-DD)');
    }
    if (toDateKey < fromDateKey) {
      throw new BadRequestException('El rango de fechas es inválido');
    }
    if (addDaysBetween(fromDateKey, toDateKey) > 60) {
      throw new BadRequestException('El rango máximo de consulta es de 60 días');
    }

    const profile = await this.prisma.professionalProfile.findUnique({ where: { id: professionalId } });
    // Solo se reserva con médicos visibles en el directorio.
    if (!profile || !profile.isPublished || !tierAtLeast(profile.planTier, AGENDA_MIN_TIER)) {
      return [];
    }

    const schedule = await this.agenda.getScheduleForProfessional(professionalId);
    if (!schedule) return [];

    const existing = await this.prisma.appointment.findMany({
      where: {
        professionalId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startsAt: { gte: startOfCaracasDay(fromDateKey), lte: endOfCaracasDay(toDateKey) },
      },
      select: { startsAt: true },
    });

    const slots = computeAvailableSlots(
      schedule,
      existing.map((e) => e.startsAt),
      fromDateKey,
      toDateKey,
    );
    return slots.map((s) => s.toISOString());
  }

  private async resolveSlot(professionalId: string, startsAtIso: string) {
    const schedule = await this.agenda.getScheduleForProfessional(professionalId);
    if (!schedule) {
      throw new BadRequestException('Este profesional no tiene agenda configurada');
    }
    const requested = new Date(startsAtIso);
    const dayKey = toVetDateKey(requested);

    const existing = await this.prisma.appointment.findMany({
      where: { professionalId, status: { in: ['PENDING', 'CONFIRMED'] } },
      select: { startsAt: true },
    });
    const availableSlots = computeAvailableSlots(schedule, existing.map((e) => e.startsAt), dayKey, dayKey);
    const match = availableSlots.find((s) => s.getTime() === requested.getTime());
    if (!match) {
      throw new ConflictException('Ese horario ya no está disponible');
    }
    const endsAt = new Date(requested.getTime() + schedule.slotDurationMinutes * 60_000);
    return { startsAt: requested, endsAt, autoConfirm: schedule.autoConfirm };
  }

  // --- Crear cita ---------------------------------------------------------

  async create(userId: string, dto: CreateAppointmentDto) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: dto.professionalId },
      select: { isPublished: true, planTier: true },
    });
    if (!professional?.isPublished || !tierAtLeast(professional.planTier, AGENDA_MIN_TIER)) {
      throw new NotFoundException('Este profesional no recibe reservas en línea');
    }
    const { startsAt, endsAt, autoConfirm } = await this.resolveSlot(dto.professionalId, dto.startsAt);
    const patient = await this.patients.getOrCreateForUser(userId, {
      firstName: dto.firstName ?? '',
      lastName: dto.lastName ?? '',
      phone: dto.phone,
    });

    const appointment = await this.insertAppointment({
      professionalId: dto.professionalId,
      patientId: patient.id,
      locationId: dto.locationId,
      startsAt,
      endsAt,
      reason: this.codec.encodeAppointmentReason(dto.reason),
      source: 'WEB',
      status: autoConfirm ? 'CONFIRMED' : 'PENDING',
    });

    if (dto.shareScopes?.length) {
      await this.patients.createGrant(userId, {
        professionalId: dto.professionalId,
        scopes: dto.shareScopes,
        durationDays: dto.shareDays,
        reason: 'Autorizado al reservar la cita',
      });
    }

    await this.notifyCreated(appointment.id);
    return this.presentAppointment(appointment);
  }

  async createManual(professionalUserId: string, dto: CreateManualAppointmentDto) {
    const profile = await this.ownProfileOrThrow(professionalUserId);
    const { startsAt, endsAt } = await this.resolveSlot(profile.id, dto.startsAt);
    const patient = await this.patients.createWalkIn(
      { firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone },
      profile.id,
    );

    const appointment = await this.insertAppointment({
      professionalId: profile.id,
      patientId: patient.id,
      locationId: dto.locationId,
      startsAt,
      endsAt,
      reason: this.codec.encodeAppointmentReason(dto.reason),
      source: 'PHONE',
      status: 'CONFIRMED',
    });
    return this.presentAppointment(appointment);
  }

  private async insertAppointment(data: {
    professionalId: string;
    patientId: string;
    locationId?: string;
    startsAt: Date;
    endsAt: Date;
    reason?: string | null;
    source: 'WEB' | 'PHONE';
    status: 'PENDING' | 'CONFIRMED';
  }) {
    try {
      return await this.prisma.appointment.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ese horario ya no está disponible');
      }
      throw error;
    }
  }

  // --- Notificaciones -------------------------------------------------

  private async notifyCreated(appointmentId: string) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: {
        patient: { include: { user: { select: { email: true } } } },
        professional: { include: { user: { select: { email: true } }, specialties: { include: { specialty: true } } } },
        location: true,
      },
    });

    const dateLabel = appt.startsAt.toLocaleDateString('es-VE', DATE_LABEL_FMT);
    const timeLabel = appt.startsAt.toLocaleTimeString('es-VE', TIME_LABEL_FMT);
    const doctorName = `${appt.professional.firstName} ${appt.professional.lastName}`;
    const specialty = appt.professional.specialties[0]?.specialty.name;
    const location = appt.location?.address ?? appt.professional.address ?? undefined;

    // Al médico
    await this.notifications.notify({
      userId: appt.professional.userId,
      type: 'APPOINTMENT_REQUESTED',
      title: 'Nueva solicitud de cita',
      content: `Paciente ${appt.patient.patientCode} — ${dateLabel} ${timeLabel}`,
      email: {
        to: appt.professional.user.email,
        subject: 'Nueva solicitud de cita — Guía Médica Monagas',
        template: 'appointment_requested_professional',
        html: appointmentRequestedProfessionalTemplate(
          doctorName,
          // El motivo de consulta es dato de salud: no viaja por correo, se lee en el panel.
          { patientCode: appt.patient.patientCode, dateLabel, timeLabel },
          `${FRONTEND_URL}/dashboard/citas`,
        ),
      },
    });

    // Al paciente (si tiene cuenta)
    if (appt.patient.userId && appt.patient.user) {
      const isConfirmed = appt.status === 'CONFIRMED';
      const html = isConfirmed
        ? appointmentConfirmedTemplate(
            appt.patient.firstName ?? 'Paciente',
            { doctorName, specialty, dateLabel, timeLabel, location },
            `${FRONTEND_URL}/paciente/citas`,
          )
        : appointmentRequestedPatientTemplate(appt.patient.firstName ?? 'Paciente', {
            doctorName,
            specialty,
            dateLabel,
            timeLabel,
            location,
          });

      await this.notifications.notify({
        userId: appt.patient.userId,
        type: isConfirmed ? 'APPOINTMENT_CONFIRMED' : 'APPOINTMENT_REQUESTED',
        title: isConfirmed ? 'Cita confirmada' : 'Solicitud de cita recibida',
        content: `Dr(a). ${doctorName} — ${dateLabel} ${timeLabel}`,
        email: {
          to: appt.patient.user.email,
          subject: isConfirmed ? 'Cita confirmada — Guía Médica Monagas' : 'Solicitud de cita recibida',
          template: isConfirmed ? 'appointment_confirmed' : 'appointment_requested_patient',
          html,
          attachments: isConfirmed ? [this.buildIcsAttachment(appt)] : undefined,
        },
      });
    }
  }

  private buildIcsAttachment(appt: { id: string; startsAt: Date; endsAt: Date; professional: { firstName: string; lastName: string }; location: { address: string } | null }) {
    const ics = buildAppointmentIcs({
      uid: `appointment-${appt.id}@guiamedicamonagas.com`,
      startsAt: appt.startsAt,
      endsAt: appt.endsAt,
      summary: `Cita con Dr(a). ${appt.professional.firstName} ${appt.professional.lastName}`,
      location: appt.location?.address,
    });
    return { filename: 'cita.ics', content: ics, contentType: 'text/calendar' };
  }

  // --- Consultas propias ------------------------------------------------

  async listOwn(userId: string) {
    const patient = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!patient) return [];
    const rows = await this.prisma.appointment.findMany({
      where: { patientId: patient.id },
      include: {
        professional: { select: { firstName: true, lastName: true, slug: true } },
        location: { select: { name: true, address: true } },
      },
      orderBy: { startsAt: 'desc' },
    });
    return rows.map((row) => this.presentAppointment(row));
  }

  private async ownProfileOrThrow(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    if (!tierAtLeast(profile.planTier, AGENDA_MIN_TIER)) {
      throw new ForbiddenException('La agenda requiere el plan Profesional o superior');
    }
    return profile;
  }

  async listOwnAgenda(userId: string, from?: string, to?: string, status?: string) {
    const profile = await this.ownProfileOrThrow(userId);
    if (status && !(Object.values(AppointmentStatus) as string[]).includes(status)) {
      throw new BadRequestException('Estado de cita inválido');
    }
    const rows = await this.prisma.appointment.findMany({
      where: {
        professionalId: profile.id,
        status: status ? (status as AppointmentStatus) : undefined,
        startsAt: {
          gte: from ? startOfCaracasDay(from) : undefined,
          lte: to ? endOfCaracasDay(to) : undefined,
        },
      },
      include: { patient: { select: { patientCode: true } }, location: { select: { name: true } } },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((row) => this.presentAppointment(row));
  }

  // --- Transiciones de estado ------------------------------------------

  private async ownAppointmentOrThrow(professionalId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt || appt.professionalId !== professionalId) {
      throw new NotFoundException('Cita no encontrada');
    }
    return appt;
  }

  async confirm(userId: string, appointmentId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const appt = await this.ownAppointmentOrThrow(profile.id, appointmentId);
    if (appt.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden confirmar citas pendientes');
    }
    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CONFIRMED', confirmationSentAt: new Date() },
    });
    await this.notifyConfirmed(appointmentId);
    return this.presentAppointment(updated);
  }

  private async notifyConfirmed(appointmentId: string) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: {
        patient: { include: { user: { select: { email: true } } } },
        professional: { include: { specialties: { include: { specialty: true } } } },
        location: true,
      },
    });
    if (!appt.patient.userId || !appt.patient.user) return;

    const dateLabel = appt.startsAt.toLocaleDateString('es-VE', DATE_LABEL_FMT);
    const timeLabel = appt.startsAt.toLocaleTimeString('es-VE', TIME_LABEL_FMT);
    const doctorName = `${appt.professional.firstName} ${appt.professional.lastName}`;

    await this.notifications.notify({
      userId: appt.patient.userId,
      type: 'APPOINTMENT_CONFIRMED',
      title: 'Cita confirmada',
      content: `Dr(a). ${doctorName} — ${dateLabel} ${timeLabel}`,
      email: {
        to: appt.patient.user.email,
        subject: 'Cita confirmada — Guía Médica Monagas',
        template: 'appointment_confirmed',
        html: appointmentConfirmedTemplate(
          appt.patient.firstName ?? 'Paciente',
          {
            doctorName,
            specialty: appt.professional.specialties[0]?.specialty.name,
            dateLabel,
            timeLabel,
            location: appt.location?.address ?? undefined,
          },
          `${FRONTEND_URL}/paciente/citas`,
        ),
        attachments: [this.buildIcsAttachment(appt)],
      },
    });
  }

  async complete(userId: string, appointmentId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const appt = await this.ownAppointmentOrThrow(profile.id, appointmentId);
    if (appt.status !== 'CONFIRMED') {
      throw new BadRequestException('Solo se pueden completar citas confirmadas');
    }
    // TODO(Fase 3a – Finanzas): auto-generar FinanceRecord de tipo INCOME aquí.
    return this.presentAppointment(
      await this.prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } }),
    );
  }

  async noShow(userId: string, appointmentId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const appt = await this.ownAppointmentOrThrow(profile.id, appointmentId);
    if (appt.status !== 'CONFIRMED') {
      throw new BadRequestException('Solo se pueden marcar como no asistidas las citas confirmadas');
    }
    return this.presentAppointment(
      await this.prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'NO_SHOW' } }),
    );
  }

  async cancel(userId: string, appointmentId: string, dto: CancelAppointmentDto) {
    const { appt, cancelledBy } = await this.resolveAppointmentForPatientOrProfessional(userId, appointmentId);
    if (appt.status === 'CANCELLED' || appt.status === 'COMPLETED') {
      throw new BadRequestException('Esta cita ya no se puede cancelar');
    }
    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy,
        cancellationReason: dto.cancellationReason,
      },
    });
    await this.notifyCancelled(appointmentId, cancelledBy, dto.cancellationReason);
    return this.presentAppointment(updated);
  }

  private async notifyCancelled(appointmentId: string, cancelledBy: 'PATIENT' | 'PROFESSIONAL', reason?: string) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { patient: { include: { user: { select: { email: true } } } }, professional: { include: { user: { select: { email: true } } } } },
    });
    const dateLabel = appt.startsAt.toLocaleDateString('es-VE', DATE_LABEL_FMT);
    const timeLabel = appt.startsAt.toLocaleTimeString('es-VE', TIME_LABEL_FMT);

    if (cancelledBy === 'PATIENT') {
      await this.notifications.notify({
        userId: appt.professional.userId,
        type: 'APPOINTMENT_CANCELLED',
        title: 'Cita cancelada por el paciente',
        content: `Paciente ${appt.patient.patientCode} — ${dateLabel} ${timeLabel}`,
        email: {
          to: appt.professional.user.email,
          subject: 'Cita cancelada — Guía Médica Monagas',
          template: 'appointment_cancelled',
          html: appointmentCancelledTemplate(
            `Dr(a). ${appt.professional.firstName}`,
            { dateLabel, timeLabel, reason },
            'el paciente',
          ),
        },
      });
    } else if (appt.patient.userId && appt.patient.user) {
      await this.notifications.notify({
        userId: appt.patient.userId,
        type: 'APPOINTMENT_CANCELLED',
        title: 'Cita cancelada por el médico',
        content: `${dateLabel} ${timeLabel}`,
        email: {
          to: appt.patient.user.email,
          subject: 'Cita cancelada — Guía Médica Monagas',
          template: 'appointment_cancelled',
          html: appointmentCancelledTemplate(appt.patient.firstName ?? 'Paciente', { dateLabel, timeLabel, reason }, 'el médico'),
        },
      });
    }
  }

  async reschedule(userId: string, appointmentId: string, dto: RescheduleAppointmentDto) {
    const { appt } = await this.resolveAppointmentForPatientOrProfessional(userId, appointmentId);
    if (appt.status === 'CANCELLED' || appt.status === 'COMPLETED') {
      throw new BadRequestException('Esta cita ya no se puede reprogramar');
    }
    const schedule = await this.agenda.getScheduleForProfessional(appt.professionalId);
    if (!schedule) throw new BadRequestException('Este profesional no tiene agenda configurada');

    const { startsAt, endsAt } = await this.resolveSlot(appt.professionalId, dto.startsAt);
    let updated;
    try {
      updated = await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          startsAt,
          endsAt,
          status: schedule.autoConfirm ? 'CONFIRMED' : 'PENDING',
          confirmationSentAt: null,
          reminderSentAt: null,
          reminder2hSentAt: null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ese horario ya no está disponible');
      }
      throw error;
    }
    await this.notifyRescheduled(appointmentId);
    return this.presentAppointment(updated);
  }

  private async notifyRescheduled(appointmentId: string) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { patient: { include: { user: { select: { email: true } } } }, professional: { include: { user: { select: { email: true } } } } },
    });
    const dateLabel = appt.startsAt.toLocaleDateString('es-VE', DATE_LABEL_FMT);
    const timeLabel = appt.startsAt.toLocaleTimeString('es-VE', TIME_LABEL_FMT);

    if (appt.patient.userId && appt.patient.user) {
      await this.notifications.notify({
        userId: appt.patient.userId,
        type: 'APPOINTMENT_RESCHEDULED',
        title: 'Cita reprogramada',
        content: `${dateLabel} ${timeLabel}`,
        email: {
          to: appt.patient.user.email,
          subject: 'Cita reprogramada — Guía Médica Monagas',
          template: 'appointment_rescheduled',
          html: appointmentRescheduledTemplate(appt.patient.firstName ?? 'Paciente', { dateLabel, timeLabel }, `${FRONTEND_URL}/paciente/citas`),
        },
      });
    }
    await this.notifications.notify({
      userId: appt.professional.userId,
      type: 'APPOINTMENT_RESCHEDULED',
      title: 'Cita reprogramada',
      content: `Paciente ${appt.patient.patientCode} — ${dateLabel} ${timeLabel}`,
      email: {
        to: appt.professional.user.email,
        subject: 'Cita reprogramada — Guía Médica Monagas',
        template: 'appointment_rescheduled',
        html: appointmentRescheduledTemplate(`Dr(a). ${appt.professional.firstName}`, { dateLabel, timeLabel }, `${FRONTEND_URL}/dashboard/citas`),
      },
    });
  }

  private async resolveAppointmentForPatientOrProfessional(userId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    const [professional, patient] = await Promise.all([
      this.prisma.professionalProfile.findUnique({ where: { userId } }),
      this.prisma.patientProfile.findUnique({ where: { userId } }),
    ]);

    if (professional && appt.professionalId === professional.id) {
      return { appt, cancelledBy: 'PROFESSIONAL' as const };
    }
    if (patient && appt.patientId === patient.id) {
      return { appt, cancelledBy: 'PATIENT' as const };
    }
    throw new ForbiddenException('No tienes permiso sobre esta cita');
  }

  // --- Pacientes (delegado a PatientsService, filtrado por profesional) --

  async listPatients(userId: string, ipAddress?: string) {
    const profile = await this.ownProfileOrThrow(userId);
    return this.patients.listForProfessional(profile.id, userId, ipAddress);
  }

  async registerPatientByCode(userId: string, code: string, ipAddress?: string) {
    const profile = await this.ownProfileOrThrow(userId);
    return this.patients.registerByShareCode(profile.id, code, userId, ipAddress);
  }

  async removePatientFromDirectory(userId: string, patientId: string, ipAddress?: string) {
    const profile = await this.ownProfileOrThrow(userId);
    return this.patients.removeFromDirectory(profile.id, patientId, userId, ipAddress);
  }

  async readPatient(userId: string, patientId: string, ipAddress?: string) {
    const profile = await this.ownProfileOrThrow(userId);
    return this.patients.readForProfessional(profile.id, patientId, userId, ipAddress);
  }

  async requestPatientAccess(userId: string, patientId: string, scopes: PatientDataScope[]) {
    const profile = await this.ownProfileOrThrow(userId);
    return this.patients.requestAccess(profile.id, patientId, userId, scopes);
  }

  /** Descifra el motivo de consulta antes de responder. */
  private presentAppointment<T extends { reason: string | null }>(appointment: T): T {
    return { ...appointment, reason: this.codec.decodeAppointmentReason(appointment.reason) };
  }
}

function addDaysBetween(fromDateKey: string, toDateKey: string): number {
  const from = new Date(`${fromDateKey}T00:00:00Z`).getTime();
  const to = new Date(`${toDateKey}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}
