import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Appointment, AppointmentActor, AppointmentStatus, PatientDataScope, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgendaService } from '../agenda/agenda.service';
import { PatientsService, type PatientLabel } from '../patients/patients.service';
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
import { isSlotConflict } from '../common/utils/prisma-errors';
import { caracasDateLabel, caracasTimeLabel } from '../common/caracas-time';
import { buildAppointmentIcs } from './ics.util';
import {
  addDaysToDateKey,
  computeAvailableSlots,
  daysBetween,
  endOfCaracasDay,
  planDays,
  startOfCaracasDay,
  toVetDateKey,
} from './availability.util';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CreateManualAppointmentDto } from './dto/create-manual-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { AgendaRangeDto, AppointmentHistoryDto, DoctorSlotsDto } from './dto/agenda-query.dto';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
/** Adónde llevan los avisos de citas en la campana. */
export const PATIENT_APPOINTMENTS_LINK = '/paciente/citas';
export function doctorAppointmentLink(appointmentId: string): string {
  return `/dashboard/agenda?cita=${appointmentId}`;
}

const ACTIVE: AppointmentStatus[] = ['PENDING', 'CONFIRMED'];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** Lo que abarca una vista de mes con sus semanas vecinas. */
const MAX_RANGE_DAYS = 62;
const HISTORY_PAGE = 30;

/** Quién actúa sobre la cita: el paciente dueño o el médico de la agenda. */
type Party = 'PATIENT' | 'PROFESSIONAL';

interface ScheduleLike {
  slotDurationMinutes: number;
  autoConfirm: boolean;
  bookingWindowDays: number;
  minNoticeMinutes: number;
}

/** Desde cuándo y hasta qué día puede reservar un paciente con ese médico. */
function patientLimits(schedule: ScheduleLike, now = new Date()) {
  return {
    earliest: new Date(now.getTime() + schedule.minNoticeMinutes * 60_000),
    lastDay: addDaysToDateKey(toVetDateKey(now), schedule.bookingWindowDays),
  };
}

function noticeLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${minutes} minutos`;
}

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

  /**
   * Horarios que un paciente puede reservar: respetan la antelación mínima y
   * hasta qué día adelante acepta reservas el médico.
   */
  async getAvailability(professionalId: string, fromDateKey: string, toDateKey: string) {
    if (!professionalId || !DATE_KEY.test(fromDateKey ?? '') || !DATE_KEY.test(toDateKey ?? '')) {
      throw new BadRequestException('professionalId, from y to son obligatorios (from/to en formato AAAA-MM-DD)');
    }
    if (toDateKey < fromDateKey) {
      throw new BadRequestException('El rango de fechas es inválido');
    }
    if (daysBetween(fromDateKey, toDateKey) > 60) {
      throw new BadRequestException('El rango máximo de consulta es de 60 días');
    }

    const profile = await this.prisma.professionalProfile.findUnique({ where: { id: professionalId } });
    // Solo se reserva con médicos visibles en el directorio.
    if (!profile || !profile.isPublished || !tierAtLeast(profile.planTier, AGENDA_MIN_TIER)) {
      return [];
    }

    const schedule = await this.agenda.getScheduleForProfessional(professionalId);
    if (!schedule) return [];

    const { earliest, lastDay } = patientLimits(schedule);
    const to = toDateKey > lastDay ? lastDay : toDateKey;
    if (to < fromDateKey) return [];

    const existing = await this.activeAppointments(professionalId, fromDateKey, to);
    return computeAvailableSlots(schedule, existing, fromDateKey, to, earliest).map((s) => s.toISOString());
  }

  /** Citas activas del médico entre dos días (sin la que se está moviendo). */
  private activeAppointments(professionalId: string, fromDateKey: string, toDateKey: string, excludeId?: string) {
    return this.prisma.appointment.findMany({
      where: {
        professionalId,
        status: { in: ACTIVE },
        startsAt: { gte: startOfCaracasDay(fromDateKey), lte: endOfCaracasDay(toDateKey) },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { startsAt: true, endsAt: true },
    });
  }

  /**
   * Un horario de la agenda que siga libre. Para el paciente, además, con la
   * antelación mínima y dentro de los días que el médico acepta reservas.
   */
  private async resolveSlot(professionalId: string, startsAtIso: string, party: Party, excludeId?: string) {
    const schedule = await this.agenda.getScheduleForProfessional(professionalId);
    if (!schedule) {
      throw new BadRequestException('Este profesional no tiene agenda configurada');
    }
    const requested = new Date(startsAtIso);
    const dayKey = toVetDateKey(requested);

    let earliest = new Date();
    if (party === 'PATIENT') {
      const limits = patientLimits(schedule);
      if (dayKey > limits.lastDay) {
        throw new BadRequestException(`Este médico recibe reservas hasta ${schedule.bookingWindowDays} días adelante`);
      }
      if (requested < limits.earliest) {
        throw new BadRequestException(`Las citas se piden con al menos ${noticeLabel(schedule.minNoticeMinutes)} de antelación`);
      }
      earliest = limits.earliest;
    }

    // Solo las citas de ese día: el cálculo no mira otras fechas.
    const existing = await this.activeAppointments(professionalId, dayKey, dayKey, excludeId);
    const available = computeAvailableSlots(schedule, existing, dayKey, dayKey, earliest);
    if (!available.some((s) => s.getTime() === requested.getTime())) {
      throw new ConflictException('Ese horario ya no está disponible');
    }
    const endsAt = new Date(requested.getTime() + schedule.slotDurationMinutes * 60_000);
    return { startsAt: requested, endsAt, autoConfirm: schedule.autoConfirm };
  }

  /**
   * Solo el médico: una hora fuera de su horario habitual (atender tarde un
   * día, por ejemplo). Tiene que ser futura y no puede pisar otra cita; la
   * base de datos lo vuelve a impedir ante dos cambios simultáneos.
   */
  private async resolveOutsideSchedule(professionalId: string, startsAtIso: string, excludeId?: string) {
    const schedule = await this.agenda.getScheduleForProfessional(professionalId);
    if (!schedule) {
      throw new BadRequestException('Configura tu agenda antes de cargar citas');
    }
    const startsAt = new Date(startsAtIso);
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('La cita tiene que ser en el futuro');
    }
    const endsAt = new Date(startsAt.getTime() + schedule.slotDurationMinutes * 60_000);
    const clash = await this.prisma.appointment.findFirst({
      where: {
        professionalId,
        status: { in: ACTIVE },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('Ya tienes otra cita en ese horario');
    }
    return { startsAt, endsAt, autoConfirm: schedule.autoConfirm };
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
    const { startsAt, endsAt, autoConfirm } = await this.resolveSlot(dto.professionalId, dto.startsAt, 'PATIENT');
    const patient = await this.patients.getOrCreateForUser(userId, {
      firstName: dto.firstName ?? '',
      lastName: dto.lastName ?? '',
      phone: dto.phone,
    });

    const appointment = await this.insertAppointment(
      {
        professionalId: dto.professionalId,
        patientId: patient.id,
        locationId: dto.locationId,
        startsAt,
        endsAt,
        reason: this.codec.encodeAppointmentReason(dto.reason),
        source: 'WEB',
        status: autoConfirm ? 'CONFIRMED' : 'PENDING',
      },
      { actor: 'PATIENT', actorUserId: userId },
    );

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
    const { startsAt, endsAt } = dto.outsideSchedule
      ? await this.resolveOutsideSchedule(profile.id, dto.startsAt)
      : await this.resolveSlot(profile.id, dto.startsAt, 'PROFESSIONAL');
    const patient = await this.patients.createWalkIn(
      { firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone },
      profile.id,
    );

    const appointment = await this.insertAppointment(
      {
        professionalId: profile.id,
        patientId: patient.id,
        locationId: dto.locationId,
        startsAt,
        endsAt,
        reason: this.codec.encodeAppointmentReason(dto.reason),
        source: 'PHONE',
        status: 'CONFIRMED',
      },
      { actor: 'PROFESSIONAL', actorUserId: professionalUserId, outsideSchedule: !!dto.outsideSchedule },
    );
    return this.presentAppointment(appointment);
  }

  /** La cita y su primer evento del historial, juntos. */
  private async insertAppointment(
    data: {
      professionalId: string;
      patientId: string;
      locationId?: string;
      startsAt: Date;
      endsAt: Date;
      reason?: string | null;
      source: 'WEB' | 'PHONE';
      status: 'PENDING' | 'CONFIRMED';
    },
    meta: { actor: AppointmentActor; actorUserId: string; outsideSchedule?: boolean },
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const appointment = await tx.appointment.create({ data });
        await tx.appointmentEvent.create({
          data: {
            appointmentId: appointment.id,
            type: 'CREATED',
            actor: meta.actor,
            actorUserId: meta.actorUserId,
            outsideSchedule: meta.outsideSchedule ?? false,
          },
        });
        return appointment;
      });
    } catch (error) {
      if (isSlotConflict(error)) {
        throw new ConflictException('Ese horario ya no está disponible');
      }
      throw error;
    }
  }

  /** Cambia la cita y deja el evento en su historial, en la misma transacción. */
  private transition(
    appointmentId: string,
    data: Prisma.AppointmentUpdateInput,
    event: Omit<Prisma.AppointmentEventUncheckedCreateInput, 'appointmentId'>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({ where: { id: appointmentId }, data });
      await tx.appointmentEvent.create({ data: { ...event, appointmentId } });
      return updated;
    });
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

    const dateLabel = caracasDateLabel(appt.startsAt);
    const timeLabel = caracasTimeLabel(appt.startsAt);
    const doctorName = `${appt.professional.firstName} ${appt.professional.lastName}`;
    const specialty = appt.professional.specialties[0]?.specialty.name;
    const location = appt.location?.address ?? appt.professional.address ?? undefined;

    // Al médico
    await this.notifications.notify({
      userId: appt.professional.userId,
      type: 'APPOINTMENT_REQUESTED',
      title: 'Nueva solicitud de cita',
      content: `Paciente ${appt.patient.patientCode} — ${dateLabel} ${timeLabel}`,
      link: doctorAppointmentLink(appt.id),
      email: {
        to: appt.professional.user.email,
        subject: 'Nueva solicitud de cita — Guía Médica Monagas',
        template: 'appointment_requested_professional',
        html: appointmentRequestedProfessionalTemplate(
          doctorName,
          // El motivo de consulta es dato de salud: no viaja por correo, se lee en el panel.
          { patientCode: appt.patient.patientCode, dateLabel, timeLabel },
          `${FRONTEND_URL}${doctorAppointmentLink(appt.id)}`,
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
        link: PATIENT_APPOINTMENTS_LINK,
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
        professional: { select: { id: true, firstName: true, lastName: true, slug: true } },
        location: { select: { name: true, address: true } },
      },
      orderBy: { startsAt: 'desc' },
    });
    return rows.map((row) => this.presentAppointment(row));
  }

  /** El perfil del médico, con o sin plan: sus citas ya reservadas se ven y se gestionan siempre. */
  private async ownProfile(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    return profile;
  }

  /** Crear citas, moverlas y el directorio de pacientes son del plan Profesional en adelante. */
  private async ownProfileOrThrow(userId: string) {
    const profile = await this.ownProfile(userId);
    if (!tierAtLeast(profile.planTier, AGENDA_MIN_TIER)) {
      throw new ForbiddenException('La agenda requiere el plan Profesional o superior');
    }
    return profile;
  }

  private checkRange(from: string, to: string) {
    if (to < from) throw new BadRequestException('El rango de fechas es inválido');
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      throw new BadRequestException(`El rango máximo es de ${MAX_RANGE_DAYS} días`);
    }
  }

  /** Lo que ve el médico de una cita: el paciente según lo que este autorizó. */
  private presentForDoctor<T extends Appointment & { location?: { id: string; name: string } | null }>(row: T, label?: PatientLabel) {
    return {
      id: row.id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      source: row.source,
      reason: this.codec.decodeAppointmentReason(row.reason),
      cancellationReason: row.cancellationReason,
      cancelledBy: row.cancelledBy,
      createdAt: row.createdAt,
      location: row.location ? { id: row.location.id, name: row.location.name } : null,
      patient: label ?? { patientId: row.patientId, patientCode: '', name: null, phone: null, access: 'NONE' as const, hasAccount: false },
    };
  }

  /** Citas del médico entre dos días (hasta 62), con cada paciente según sus permisos. */
  async listOwnAgenda(userId: string, query: AgendaRangeDto, ipAddress?: string) {
    const profile = await this.ownProfile(userId);
    this.checkRange(query.from, query.to);
    return this.agendaRows(profile.id, userId, query.from, query.to, query.status, ipAddress);
  }

  private async agendaRows(professionalId: string, userId: string, from: string, to: string, status?: AppointmentStatus, ipAddress?: string) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        professionalId,
        status,
        startsAt: { gte: startOfCaracasDay(from), lte: endOfCaracasDay(to) },
      },
      include: { location: { select: { id: true, name: true } } },
      orderBy: { startsAt: 'asc' },
    });
    const labels = await this.patients.labelsForProfessional(professionalId, rows.map((r) => r.patientId), userId, ipAddress);
    return rows.map((row) => this.presentForDoctor(row, labels.get(row.patientId)));
  }

  /**
   * Todo lo que dibuja el calendario de un rango: el horario de atención de
   * cada día (sin lo bloqueado), lo bloqueado con su motivo y las citas. Sin
   * plan (`planActive` false) se ven y se gestionan las citas ya reservadas,
   * pero no se reciben ni se crean citas nuevas.
   */
  async calendar(userId: string, query: AgendaRangeDto, ipAddress?: string) {
    const profile = await this.ownProfile(userId);
    this.checkRange(query.from, query.to);
    const schedule = await this.agenda.getScheduleForProfessional(profile.id);
    const days = schedule ? planDays(schedule, query.from, query.to) : [];
    const appointments = await this.agendaRows(profile.id, userId, query.from, query.to, query.status, ipAddress);
    return {
      planActive: tierAtLeast(profile.planTier, AGENDA_MIN_TIER),
      settings: schedule
        ? {
            slotDurationMinutes: schedule.slotDurationMinutes,
            bufferMinutes: schedule.bufferMinutes,
            maxDailyAppointments: schedule.maxDailyAppointments,
            autoConfirm: schedule.autoConfirm,
            bookingWindowDays: schedule.bookingWindowDays,
            minNoticeMinutes: schedule.minNoticeMinutes,
          }
        : null,
      days: days.map((day) => ({
        date: day.dateKey,
        special: day.special,
        open: day.open.map((p) => ({ start: p.start.toISOString(), end: p.end.toISOString() })),
        blocked: day.blocked.map((b) => ({
          id: b.id ?? null,
          start: b.start.toISOString(),
          end: b.end.toISOString(),
          allDay: b.allDay,
          reason: b.reason,
        })),
      })),
      appointments,
    };
  }

  /**
   * Horarios libres para mover una cita sin arrastrarla. Sin la antelación ni
   * el límite de días de los pacientes: es el propio médico quien la mueve.
   */
  async doctorSlots(userId: string, query: DoctorSlotsDto) {
    const profile = await this.ownProfileOrThrow(userId);
    this.checkRange(query.from, query.to);
    const schedule = await this.agenda.getScheduleForProfessional(profile.id);
    if (!schedule) return [];
    const existing = await this.activeAppointments(profile.id, query.from, query.to, query.excludeId);
    return computeAvailableSlots(schedule, existing, query.from, query.to).map((s) => s.toISOString());
  }

  /** Una cita del médico con todo su historial. */
  async getOwnAppointment(userId: string, appointmentId: string, ipAddress?: string) {
    const profile = await this.ownProfile(userId);
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, professionalId: profile.id },
      include: { location: { select: { id: true, name: true } }, events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    const labels = await this.patients.labelsForProfessional(profile.id, [appt.patientId], userId, ipAddress);
    return {
      ...this.presentForDoctor(appt, labels.get(appt.patientId)),
      events: appt.events.map((event) => ({
        type: event.type,
        actor: event.actor,
        previousStartsAt: event.previousStartsAt,
        newStartsAt: event.newStartsAt,
        outsideSchedule: event.outsideSchedule,
        createdAt: event.createdAt,
      })),
    };
  }

  /**
   * Historial de citas del médico, de la más reciente a la más vieja, con
   * filtros. Con un paciente, además, sus totales por estado.
   */
  async history(userId: string, query: AppointmentHistoryDto, ipAddress?: string) {
    const profile = await this.ownProfile(userId);
    if (query.from && query.to && query.to < query.from) {
      throw new BadRequestException('El rango de fechas es inválido');
    }
    const code = query.patientCode?.trim().toUpperCase();
    const where: Prisma.AppointmentWhereInput = {
      professionalId: profile.id,
      status: query.status,
      source: query.source,
      locationId: query.locationId,
      patientId: query.patientId,
      ...(code ? { patient: { patientCode: code } } : {}),
      startsAt: {
        gte: query.from ? startOfCaracasDay(query.from) : undefined,
        lte: query.to ? endOfCaracasDay(query.to) : undefined,
      },
    };
    const limit = query.limit ?? HISTORY_PAGE;
    const rows = await this.prisma.appointment.findMany({
      where,
      include: { location: { select: { id: true, name: true } } },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const labels = await this.patients.labelsForProfessional(profile.id, page.map((r) => r.patientId), userId, ipAddress);

    let summary: Record<AppointmentStatus, number> | null = null;
    if (query.patientId) {
      const grouped = await this.prisma.appointment.groupBy({
        by: ['status'],
        where: { professionalId: profile.id, patientId: query.patientId },
        _count: { _all: true },
      });
      summary = Object.fromEntries(Object.values(AppointmentStatus).map((s) => [s, 0])) as Record<AppointmentStatus, number>;
      for (const row of grouped) summary[row.status] = row._count._all;
    }

    return {
      items: page.map((row) => this.presentForDoctor(row, labels.get(row.patientId))),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
      summary,
    };
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
    const profile = await this.ownProfile(userId);
    const appt = await this.ownAppointmentOrThrow(profile.id, appointmentId);
    if (appt.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden confirmar citas pendientes');
    }
    const updated = await this.transition(
      appointmentId,
      { status: 'CONFIRMED', confirmationSentAt: new Date() },
      { type: 'CONFIRMED', actor: 'PROFESSIONAL', actorUserId: userId },
    );
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

    const dateLabel = caracasDateLabel(appt.startsAt);
    const timeLabel = caracasTimeLabel(appt.startsAt);
    const doctorName = `${appt.professional.firstName} ${appt.professional.lastName}`;

    await this.notifications.notify({
      userId: appt.patient.userId,
      type: 'APPOINTMENT_CONFIRMED',
      title: 'Cita confirmada',
      content: `Dr(a). ${doctorName} — ${dateLabel} ${timeLabel}`,
      link: PATIENT_APPOINTMENTS_LINK,
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
    const profile = await this.ownProfile(userId);
    const appt = await this.ownAppointmentOrThrow(profile.id, appointmentId);
    if (appt.status !== 'CONFIRMED') {
      throw new BadRequestException('Solo se pueden completar citas confirmadas');
    }
    // TODO(Fase 3a – Finanzas): auto-generar FinanceRecord de tipo INCOME aquí.
    return this.presentAppointment(
      await this.transition(appointmentId, { status: 'COMPLETED' }, { type: 'COMPLETED', actor: 'PROFESSIONAL', actorUserId: userId }),
    );
  }

  async noShow(userId: string, appointmentId: string) {
    const profile = await this.ownProfile(userId);
    const appt = await this.ownAppointmentOrThrow(profile.id, appointmentId);
    if (appt.status !== 'CONFIRMED') {
      throw new BadRequestException('Solo se pueden marcar como no asistidas las citas confirmadas');
    }
    return this.presentAppointment(
      await this.transition(appointmentId, { status: 'NO_SHOW' }, { type: 'NO_SHOW', actor: 'PROFESSIONAL', actorUserId: userId }),
    );
  }

  async cancel(userId: string, appointmentId: string, dto: CancelAppointmentDto) {
    const { appt, party } = await this.resolveAppointmentForPatientOrProfessional(userId, appointmentId);
    if (appt.status === 'CANCELLED' || appt.status === 'COMPLETED') {
      throw new BadRequestException('Esta cita ya no se puede cancelar');
    }
    const updated = await this.transition(
      appointmentId,
      {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: party,
        cancellationReason: dto.cancellationReason,
      },
      { type: 'CANCELLED', actor: party, actorUserId: userId },
    );
    await this.notifyCancelled(appointmentId, party, dto.cancellationReason);
    return this.presentAppointment(updated);
  }

  private async notifyCancelled(appointmentId: string, cancelledBy: Party, reason?: string) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { patient: { include: { user: { select: { email: true } } } }, professional: { include: { user: { select: { email: true } } } } },
    });
    const dateLabel = caracasDateLabel(appt.startsAt);
    const timeLabel = caracasTimeLabel(appt.startsAt);

    if (cancelledBy === 'PATIENT') {
      await this.notifications.notify({
        userId: appt.professional.userId,
        type: 'APPOINTMENT_CANCELLED',
        title: 'Cita cancelada por el paciente',
        content: `Paciente ${appt.patient.patientCode} — ${dateLabel} ${timeLabel}`,
        link: doctorAppointmentLink(appt.id),
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
        link: PATIENT_APPOINTMENTS_LINK,
        email: {
          to: appt.patient.user.email,
          subject: 'Cita cancelada — Guía Médica Monagas',
          template: 'appointment_cancelled',
          html: appointmentCancelledTemplate(appt.patient.firstName ?? 'Paciente', { dateLabel, timeLabel, reason }, 'el médico'),
        },
      });
    }
  }

  /**
   * Mover una cita. El paciente elige entre los horarios libres (con la
   * antelación mínima) y la cita vuelve a «por confirmar» salvo confirmación
   * automática. El médico puede ponerla fuera de su horario y la cita
   * conserva su estado. Se avisa solo a la otra parte.
   */
  async reschedule(userId: string, appointmentId: string, dto: RescheduleAppointmentDto) {
    const { appt, party } = await this.resolveAppointmentForPatientOrProfessional(userId, appointmentId);
    if (appt.status !== 'PENDING' && appt.status !== 'CONFIRMED') {
      throw new BadRequestException('Esta cita ya no se puede reprogramar');
    }
    const outside = party === 'PROFESSIONAL' && !!dto.outsideSchedule;
    const { startsAt, endsAt, autoConfirm } = outside
      ? await this.resolveOutsideSchedule(appt.professionalId, dto.startsAt, appt.id)
      : await this.resolveSlot(appt.professionalId, dto.startsAt, party, appt.id);
    if (startsAt.getTime() === appt.startsAt.getTime()) {
      throw new BadRequestException('La cita ya está en ese horario');
    }

    let updated;
    try {
      updated = await this.transition(
        appointmentId,
        {
          startsAt,
          endsAt,
          status: party === 'PROFESSIONAL' ? appt.status : autoConfirm ? 'CONFIRMED' : 'PENDING',
          confirmationSentAt: null,
          reminderSentAt: null,
          reminder2hSentAt: null,
        },
        { type: 'RESCHEDULED', actor: party, actorUserId: userId, previousStartsAt: appt.startsAt, newStartsAt: startsAt, outsideSchedule: outside },
      );
    } catch (error) {
      if (isSlotConflict(error)) {
        throw new ConflictException('Ese horario ya no está disponible');
      }
      throw error;
    }
    await this.notifyRescheduled(appointmentId, party);
    return this.presentAppointment(updated);
  }

  private async notifyRescheduled(appointmentId: string, movedBy: Party) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { patient: { include: { user: { select: { email: true } } } }, professional: { include: { user: { select: { email: true } } } } },
    });
    const dateLabel = caracasDateLabel(appt.startsAt);
    const timeLabel = caracasTimeLabel(appt.startsAt);

    if (movedBy === 'PROFESSIONAL' && appt.patient.userId && appt.patient.user) {
      await this.notifications.notify({
        userId: appt.patient.userId,
        type: 'APPOINTMENT_RESCHEDULED',
        title: 'Cita reprogramada',
        content: `${dateLabel} ${timeLabel}`,
        link: PATIENT_APPOINTMENTS_LINK,
        email: {
          to: appt.patient.user.email,
          subject: 'Cita reprogramada — Guía Médica Monagas',
          template: 'appointment_rescheduled',
          html: appointmentRescheduledTemplate(appt.patient.firstName ?? 'Paciente', { dateLabel, timeLabel }, `${FRONTEND_URL}/paciente/citas`),
        },
      });
    }
    if (movedBy === 'PATIENT') {
      await this.notifications.notify({
        userId: appt.professional.userId,
        type: 'APPOINTMENT_RESCHEDULED',
        title: 'Cita reprogramada por el paciente',
        content: `Paciente ${appt.patient.patientCode} — ${dateLabel} ${timeLabel}`,
        link: doctorAppointmentLink(appt.id),
        email: {
          to: appt.professional.user.email,
          subject: 'Cita reprogramada — Guía Médica Monagas',
          template: 'appointment_rescheduled',
          html: appointmentRescheduledTemplate(
            `Dr(a). ${appt.professional.firstName}`,
            { dateLabel, timeLabel },
            `${FRONTEND_URL}${doctorAppointmentLink(appt.id)}`,
          ),
        },
      });
    }
  }

  private async resolveAppointmentForPatientOrProfessional(userId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    const [professional, patient] = await Promise.all([
      this.prisma.professionalProfile.findUnique({ where: { userId } }),
      this.prisma.patientProfile.findUnique({ where: { userId } }),
    ]);

    if (professional && appt.professionalId === professional.id) {
      return { appt, party: 'PROFESSIONAL' as const };
    }
    if (patient && appt.patientId === patient.id) {
      return { appt, party: 'PATIENT' as const };
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
