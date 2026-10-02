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
