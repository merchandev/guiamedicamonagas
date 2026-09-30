import { Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, EventType, PlanTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackEventDto } from './dto/track-event.dto';

/**
 * Qué ve el médico en «Estadísticas», según lo que anuncia cada plan:
 * Profesional «estadísticas básicas», Plus «completas», Premium y Marca
 * Médica «analítica avanzada». El Perfil Básico no incluye estadísticas.
 */
export type StatsLevel = 'NONE' | 'BASIC' | 'FULL' | 'ADVANCED';
const LEVEL_BY_TIER: Record<PlanTier, StatsLevel> = {
  FREE: 'NONE',
  PROFESSIONAL: 'BASIC',
  PROFESSIONAL_PLUS: 'FULL',
  PREMIUM: 'ADVANCED',
  AGENCY: 'ADVANCED',
  ORGANIZATION: 'NONE',
};

// Solo los eventos que el sitio registra de verdad para un médico.
const BASIC_EVENTS: EventType[] = ['PROFILE_VIEW', 'WHATSAPP_CLICK', 'PHONE_CLICK'];
const FULL_EVENTS: EventType[] = [...BASIC_EVENTS, 'SOCIAL_LINK_CLICK'];
const PERIOD_DAYS = 30;
const MONTHS = 6;
const DAY_MS = 86_400_000;

type Counts = Record<string, number>;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(dto: TrackEventDto) {
    await this.prisma.analyticsEvent.create({
      data: { eventType: dto.eventType, resourceId: dto.resourceId },
    });
    return { ok: true };
  }

  async statsForOwnProfile(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true, planTier: true } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');

    const level = LEVEL_BY_TIER[profile.planTier];
    if (level === 'NONE') return { level, planTier: profile.planTier };

    const now = Date.now();
    const since = new Date(now - PERIOD_DAYS * DAY_MS);
    const before = new Date(now - 2 * PERIOD_DAYS * DAY_MS);
    const eventTypes = level === 'BASIC' ? BASIC_EVENTS : FULL_EVENTS;

    const events = {
      total: await this.countEvents(profile.id, eventTypes),
      last30: await this.countEvents(profile.id, eventTypes, since),
      ...(level === 'ADVANCED' ? { previous30: await this.countEvents(profile.id, eventTypes, before, since) } : {}),
    };
    if (level === 'BASIC') return { level, planTier: profile.planTier, periodDays: PERIOD_DAYS, events };

    // Citas y mensajes salen de la agenda y de la bandeja del médico.
    const appointments = {
      last30: await this.countAppointments(profile.id, since),
      ...(level === 'ADVANCED' ? { previous30: await this.countAppointments(profile.id, before, since) } : {}),
    };
    const messages = {
      last30: await this.prisma.contactMessage.count({ where: { professionalId: profile.id, createdAt: { gte: since } } }),
      ...(level === 'ADVANCED'
        ? { previous30: await this.prisma.contactMessage.count({ where: { professionalId: profile.id, createdAt: { gte: before, lt: since } } }) }
        : {}),
    };
    if (level === 'FULL') return { level, planTier: profile.planTier, periodDays: PERIOD_DAYS, events, appointments, messages };

    return { level, planTier: profile.planTier, periodDays: PERIOD_DAYS, events, appointments, messages, monthly: await this.monthly(profile.id, eventTypes) };
  }

  private async countEvents(resourceId: string, eventTypes: EventType[], from?: Date, to?: Date): Promise<Counts> {
    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['eventType'],
      where: { resourceId, eventType: { in: eventTypes }, createdAt: { gte: from, lt: to } },
      _count: { _all: true },
    });
    const counts: Counts = Object.fromEntries(eventTypes.map((type) => [type, 0]));
    for (const row of grouped) counts[row.eventType] = row._count._all;
    return counts;
  }

  /** Citas pedidas en el periodo (por fecha de reserva), por estado. */
  private async countAppointments(professionalId: string, from: Date, to?: Date) {
    const grouped = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: { professionalId, createdAt: { gte: from, lt: to } },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(Object.values(AppointmentStatus).map((status) => [status, 0])) as Record<AppointmentStatus, number>;
    for (const row of grouped) byStatus[row.status] = row._count._all;
    return { total: grouped.reduce((sum, row) => sum + row._count._all, 0), byStatus };
  }

  /** Últimos 6 meses (hora de Caracas): eventos y citas pedidas por mes. */
  private async monthly(resourceId: string, eventTypes: EventType[]) {
    const start = new Date(Date.now() - (MONTHS * 31 + 1) * DAY_MS);
    const [eventRows, appointmentRows] = await Promise.all([
      this.prisma.$queryRaw<{ month: string; type: string; n: number }[]>`
        SELECT to_char(date_trunc('month', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Caracas'), 'YYYY-MM') AS month,
               "eventType"::text AS type, count(*)::int AS n
        FROM "AnalyticsEvent"
        WHERE "resourceId" = ${resourceId} AND "createdAt" >= ${start} AND "eventType"::text = ANY(${eventTypes as string[]})
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ month: string; n: number }[]>`
        SELECT to_char(date_trunc('month', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Caracas'), 'YYYY-MM') AS month, count(*)::int AS n
        FROM "Appointment"
        WHERE "professionalId" = ${resourceId} AND "createdAt" >= ${start}
        GROUP BY 1`,
    ]);
    const months = lastMonths(MONTHS);
    return months.map((month) => ({
      month,
      events: Object.fromEntries(eventTypes.map((type) => [type, eventRows.find((r) => r.month === month && r.type === type)?.n ?? 0])),
      appointments: appointmentRows.find((r) => r.month === month)?.n ?? 0,
    }));
  }
}

/** ['2026-05', …, '2026-10'] en hora de Caracas, del más viejo al actual. */
function lastMonths(count: number): string[] {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}
