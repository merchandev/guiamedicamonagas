// Venezuela usa un único huso horario fijo (UTC-4, sin horario de verano),
// así que basta un offset constante para combinar una fecha "YYYY-MM-DD" con
// una hora "HH:mm" de los bloques de horario (que son wall-clock locales).
const VET_OFFSET = '-04:00';

export function combineDateAndTime(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${time}:00${VET_OFFSET}`);
}

/** Formatea una fecha UTC a su "YYYY-MM-DD" correspondiente en hora de Venezuela. */
export function toVetDateKey(date: Date): string {
  const vet = new Date(date.getTime() - 4 * 60 * 60 * 1000);
  return vet.toISOString().slice(0, 10);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

interface ScheduleBlockLike {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface ScheduleExceptionLike {
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
  const exceptionByDay = new Map(schedule.exceptions.map((e) => [toVetDateKey(e.date), e]));

  const slots: Date[] = [];
  let dayKey = fromDateKey;
  let iterations = 0;
  while (dayKey <= toDateKey && iterations < 62) {
    iterations += 1;
    const exception = exceptionByDay.get(dayKey);

    if (!exception?.isBlocked) {
      const dayOfWeek = new Date(`${dayKey}T12:00:00-04:00`).getUTCDay();
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
