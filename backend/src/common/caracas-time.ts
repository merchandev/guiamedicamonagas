/**
 * Fechas y horas para textos que leen las personas (correos, notificaciones,
 * avisos): siempre en hora de Caracas, sin depender de la zona del servidor.
 * Los contenedores corren en UTC; sin la zona explícita, una cita de las
 * 10:00 a. m. se escribía «2:00 p. m.» y una de las 9:00 p. m. caía al día
 * siguiente.
 */
export const VENEZUELA_TIME_ZONE = 'America/Caracas';

const dateLabelFormat = new Intl.DateTimeFormat('es-VE', { dateStyle: 'full', timeZone: VENEZUELA_TIME_ZONE });
const timeLabelFormat = new Intl.DateTimeFormat('es-VE', { timeStyle: 'short', timeZone: VENEZUELA_TIME_ZONE });
const longDateFormat = new Intl.DateTimeFormat('es-VE', { dateStyle: 'long', timeZone: VENEZUELA_TIME_ZONE });
const dateKeyFormat = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: VENEZUELA_TIME_ZONE });

/** «lunes, 5 de octubre de 2026» */
export function caracasDateLabel(date: Date): string {
  return dateLabelFormat.format(date);
}

/** «10:00 a. m.» */
export function caracasTimeLabel(date: Date): string {
  return timeLabelFormat.format(date);
}

/** «5 de octubre de 2026» */
export function caracasLongDate(date: Date): string {
  return longDateFormat.format(date);
}

/** «2026-10»: el mes en Caracas (a las 9:00 p. m. del último día del mes, en UTC ya es el mes siguiente). */
export function caracasMonthKey(date: Date): string {
  return dateKeyFormat.format(date).slice(0, 7);
}

/** «2026-10-05»: el día en Caracas. */
export function caracasDayKey(date: Date): string {
  return dateKeyFormat.format(date);
}

/**
 * Último instante (23:59:59.999, hora de Caracas) del día que cae `days` días
 * después de `date`. Venezuela no cambia de hora: siempre UTC−4.
 */
export function caracasEndOfDay(date: Date, days = 0): Date {
  const [year, month, day] = caracasDayKey(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 23 + 4, 59, 59, 999));
}
