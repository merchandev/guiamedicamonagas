/**
 * Dominio temporal de la agenda: America/Caracas. Las fechas de agenda
 * ("YYYY-MM-DD") y las horas de los bloques ("HH:mm") son de reloj local
 * venezolano; se convierten a instantes UTC con la zona horaria IANA en vez
 * de un "-04:00" fijo, así un cambio de huso (como el de 2016) solo requiere
 * actualizar la base de datos de zonas horarias del sistema.
 */
export const VENEZUELA_TIME_ZONE = 'America/Caracas';

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
  /** Fecha de calendario a medianoche UTC. */
  date: Date;
  isBlocked: boolean;
  startTime: string | null;
  endTime: string | null;
}

interface ScheduleConfigLike {
  slotDurationMinutes: number;
  bufferMinutes: number;
  maxDailyAppointments: number | null;
  blocks: ScheduleBlockLike[];
  exceptions: ScheduleExceptionLike[];
}

/**
 * Calcula los horarios de inicio disponibles entre fromDateKey y toDateKey
 * (inclusive, formato "YYYY-MM-DD" en hora de Venezuela), excluyendo los que
 * ya están ocupados (existingStarts) y respetando excepciones y el máximo
 * diario. Nunca devuelve horarios en el pasado.
 */
export function computeAvailableSlots(
  schedule: ScheduleConfigLike,
  existingStarts: Date[],
  fromDateKey: string,
  toDateKey: string,
  now: Date = new Date(),
): Date[] {
  const takenIso = new Set(existingStarts.map((d) => d.toISOString()));
  const existingCountByDay = new Map<string, number>();
  for (const d of existingStarts) {
    const key = toVetDateKey(d);
    existingCountByDay.set(key, (existingCountByDay.get(key) ?? 0) + 1);
  }
  // Las excepciones son fechas de calendario guardadas a medianoche UTC
  // (el panel envía "YYYY-MM-DD"): su día es la parte de fecha en UTC, no el
  // día en Caracas — convertirlas desplazaba el bloqueo al día anterior.
  const exceptionByDay = new Map(schedule.exceptions.map((e) => [e.date.toISOString().slice(0, 10), e]));

  const slots: Date[] = [];
  let dayKey = fromDateKey;
  let iterations = 0;
  while (dayKey <= toDateKey && iterations < 62) {
    iterations += 1;
    const exception = exceptionByDay.get(dayKey);

    if (!exception?.isBlocked) {
      const dayOfWeek = dayOfWeekForDateKey(dayKey);
      const dayBlocks =
        exception && exception.startTime && exception.endTime
          ? [{ dayOfWeek, startTime: exception.startTime, endTime: exception.endTime }]
          : schedule.blocks.filter((b) => b.dayOfWeek === dayOfWeek);

      let remainingCapacity =
        schedule.maxDailyAppointments != null
          ? schedule.maxDailyAppointments - (existingCountByDay.get(dayKey) ?? 0)
          : Infinity;

      for (const block of dayBlocks) {
        if (remainingCapacity <= 0) break;
        let cursor = combineDateAndTime(dayKey, block.startTime);
        const blockEnd = combineDateAndTime(dayKey, block.endTime);
        const stepMs = (schedule.slotDurationMinutes + schedule.bufferMinutes) * 60_000;
        const slotMs = schedule.slotDurationMinutes * 60_000;

        while (cursor.getTime() + slotMs <= blockEnd.getTime() && remainingCapacity > 0) {
          if (cursor.getTime() > now.getTime() && !takenIso.has(cursor.toISOString())) {
            slots.push(new Date(cursor));
            remainingCapacity -= 1;
          }
          cursor = new Date(cursor.getTime() + stepMs);
        }
      }
    }

    dayKey = addDaysToDateKey(dayKey, 1);
  }

  return slots;
}
