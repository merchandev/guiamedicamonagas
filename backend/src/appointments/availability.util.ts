/**
 * Dominio temporal de la agenda: America/Caracas. Las fechas de agenda
 * ("YYYY-MM-DD") y las horas de los bloques ("HH:mm") son de reloj local
 * venezolano; se convierten a instantes UTC con la zona horaria IANA en vez
 * de un "-04:00" fijo, así un cambio de huso (como el de 2016) solo requiere
 * actualizar la base de datos de zonas horarias del sistema.
 */
import { VENEZUELA_TIME_ZONE } from '../common/caracas-time';

export { VENEZUELA_TIME_ZONE };

const offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone: VENEZUELA_TIME_ZONE, timeZoneName: 'longOffset' });
const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VENEZUELA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Desfase de America/Caracas respecto de UTC en ese instante, en minutos (ej. -240). */
export function caracasOffsetMinutes(instant: Date): number {
  const name = offsetFormatter.formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
}

/** "2026-09-23" + "08:30" (hora de Caracas) → instante UTC. */
export function combineDateAndTime(dateKey: string, time: string): Date {
  const asUtc = new Date(`${dateKey}T${time}:00Z`);
  return new Date(asUtc.getTime() - caracasOffsetMinutes(asUtc) * 60_000);
}

/** Inicio (00:00:00.000) del día de Caracas indicado, como instante UTC. */
export function startOfCaracasDay(dateKey: string): Date {
  return combineDateAndTime(dateKey, '00:00');
}

/** Fin (23:59:59.999) del día de Caracas indicado, como instante UTC. */
export function endOfCaracasDay(dateKey: string): Date {
  return new Date(startOfCaracasDay(addDaysToDateKey(dateKey, 1)).getTime() - 1);
}

/** Instante UTC → "YYYY-MM-DD" del calendario de Caracas. */
export function toVetDateKey(date: Date): string {
  return dateKeyFormatter.format(date);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Días de calendario entre dos fechas (to − from). */
export function daysBetween(fromDateKey: string, toDateKey: string): number {
  const from = new Date(`${fromDateKey}T00:00:00Z`).getTime();
  const to = new Date(`${toDateKey}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/** Día de la semana de una fecha de calendario (0 = domingo); no depende de la zona. */
export function dayOfWeekForDateKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

interface ScheduleBlockLike {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface ScheduleExceptionLike {
  id?: string;
  /** Fecha de calendario a medianoche UTC. */
  date: Date;
  isBlocked: boolean;
  startTime: string | null;
  endTime: string | null;
  reason?: string | null;
}

interface ScheduleConfigLike {
  slotDurationMinutes: number;
  bufferMinutes: number;
  maxDailyAppointments: number | null;
  blocks: ScheduleBlockLike[];
  exceptions: ScheduleExceptionLike[];
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface DayPlan {
  /** «2026-10-05» (calendario de Caracas). */
  dateKey: string;
  /** Tramos de atención del día, ya sin los tramos bloqueados. */
  open: Interval[];
  /** Día bloqueado entero o tramos bloqueados, con su motivo (y la excepción que lo bloquea). */
  blocked: (Interval & { id?: string; allDay: boolean; reason: string | null })[];
  /** Ese día rige un horario especial en lugar del semanal. */
  special: boolean;
}

/** Tramos en minutos del día [desde, hasta). */
type MinuteRange = [number, number];

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Quita a cada tramo las partes que caen dentro de los bloqueados. */
function subtractRanges(base: MinuteRange[], cut: MinuteRange[]): MinuteRange[] {
  let result = base;
  for (const [cutStart, cutEnd] of cut) {
    result = result.flatMap(([start, end]) => {
      if (cutEnd <= start || cutStart >= end) return [[start, end] as MinuteRange];
      const pieces: MinuteRange[] = [];
      if (cutStart > start) pieces.push([start, cutStart]);
      if (cutEnd < end) pieces.push([cutEnd, end]);
      return pieces;
    });
  }
  return result;
}

/**
 * Cómo queda cada día entre fromDateKey y toDateKey: horario de atención
 * (semanal o especial) menos los tramos bloqueados, y lo bloqueado con su
 * motivo. Las excepciones son fechas de calendario guardadas a medianoche UTC
 * (el panel envía "YYYY-MM-DD"): su día es la parte de fecha en UTC, no el día
 * en Caracas — convertirlas desplazaba el bloqueo al día anterior.
 */
export function planDays(schedule: Pick<ScheduleConfigLike, 'blocks' | 'exceptions'>, fromDateKey: string, toDateKey: string): DayPlan[] {
  const exceptionsByDay = new Map<string, ScheduleExceptionLike[]>();
  for (const exception of schedule.exceptions) {
    const key = exception.date.toISOString().slice(0, 10);
    exceptionsByDay.set(key, [...(exceptionsByDay.get(key) ?? []), exception]);
  }

  const days: DayPlan[] = [];
  let dateKey = fromDateKey;
  for (let i = 0; dateKey <= toDateKey && i < 400; i++) {
    const exceptions = exceptionsByDay.get(dateKey) ?? [];
    const fullDay = exceptions.find((e) => e.isBlocked && !(e.startTime && e.endTime));
    if (fullDay) {
      days.push({
        dateKey,
        open: [],
        blocked: [
          {
            id: fullDay.id,
            start: startOfCaracasDay(dateKey),
            end: startOfCaracasDay(addDaysToDateKey(dateKey, 1)),
            allDay: true,
            reason: fullDay.reason ?? null,
          },
        ],
        special: false,
      });
    } else {
      const special = exceptions.find((e) => !e.isBlocked && e.startTime && e.endTime);
      const dayOfWeek = dayOfWeekForDateKey(dateKey);
      const base: MinuteRange[] = special
        ? [[toMinutes(special.startTime!), toMinutes(special.endTime!)]]
        : schedule.blocks
            .filter((b) => b.dayOfWeek === dayOfWeek)
            .map((b): MinuteRange => [toMinutes(b.startTime), toMinutes(b.endTime)])
            .sort((a, b) => a[0] - b[0]);
      const partial = exceptions.filter((e) => e.isBlocked && e.startTime && e.endTime);
      const open = subtractRanges(
        base,
        partial.map((e): MinuteRange => [toMinutes(e.startTime!), toMinutes(e.endTime!)]),
      ).filter(([start, end]) => end > start);
      days.push({
        dateKey,
        open: open.map(([start, end]) => ({ start: combineDateAndTime(dateKey, toTime(start)), end: combineDateAndTime(dateKey, toTime(end)) })),
        blocked: partial.map((e) => ({
          id: e.id,
          start: combineDateAndTime(dateKey, e.startTime!),
          end: combineDateAndTime(dateKey, e.endTime!),
          allDay: false,
          reason: e.reason ?? null,
        })),
        special: !!special,
      });
    }
    dateKey = addDaysToDateKey(dateKey, 1);
  }
  return days;
}

/** Una cita ya agendada: con su fin, o solo su inicio (dura lo de un horario). */
export type BookedTime = Date | { startsAt: Date; endsAt: Date };

/**
 * Calcula los horarios de inicio disponibles entre fromDateKey y toDateKey
 * (inclusive, formato "YYYY-MM-DD" en hora de Venezuela), excluyendo los que
 * se solapan con citas ya agendadas y respetando excepciones y el máximo
 * diario. Nunca devuelve horarios anteriores a `earliest` (por defecto, ahora;
 * para un paciente, ahora más la antelación mínima).
 */
export function computeAvailableSlots(
  schedule: ScheduleConfigLike,
  existing: BookedTime[],
  fromDateKey: string,
  toDateKey: string,
  earliest: Date = new Date(),
): Date[] {
  const slotMs = schedule.slotDurationMinutes * 60_000;
  const stepMs = (schedule.slotDurationMinutes + schedule.bufferMinutes) * 60_000;
  const booked = existing.map((b) =>
    b instanceof Date ? { start: b.getTime(), end: b.getTime() + slotMs } : { start: b.startsAt.getTime(), end: b.endsAt.getTime() },
  );
  const countByDay = new Map<string, number>();
  for (const b of booked) {
    const key = toVetDateKey(new Date(b.start));
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const slots: Date[] = [];
  for (const day of planDays(schedule, fromDateKey, toDateKey).slice(0, 62)) {
    let remaining = schedule.maxDailyAppointments != null ? schedule.maxDailyAppointments - (countByDay.get(day.dateKey) ?? 0) : Infinity;
    for (const period of day.open) {
      for (let cursor = period.start.getTime(); cursor + slotMs <= period.end.getTime() && remaining > 0; cursor += stepMs) {
        if (cursor <= earliest.getTime()) continue;
        const overlaps = booked.some((b) => cursor < b.end && cursor + slotMs > b.start);
        if (overlaps) continue;
        slots.push(new Date(cursor));
        remaining -= 1;
      }
    }
  }
  return slots;
}

/** El intervalo cae dentro del horario de atención de ese día (para avisar «fuera de horario»). */
export function withinOpenHours(day: DayPlan, start: Date, end: Date): boolean {
  return day.open.some((period) => start >= period.start && end <= period.end);
}
