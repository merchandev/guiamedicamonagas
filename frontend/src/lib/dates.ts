/**
 * Fechas y horas siempre en hora de Caracas, sin depender de la zona del
 * navegador ni de la del servidor: la web también corre en UTC, así que una
 * página armada en el servidor mostraba la fecha de Londres.
 */
export const CARACAS_TIME_ZONE = 'America/Caracas';

type DateInput = string | number | Date;

/** Solo la fecha: «5/10/2026» por defecto, o el estilo pedido. */
export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(value).toLocaleDateString('es-VE', { ...options, timeZone: CARACAS_TIME_ZONE });
}

/** Fecha y hora: «5/10/2026, 10:00:00 a. m.» por defecto, o el estilo pedido. */
export function formatDateTime(value: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(value).toLocaleString('es-VE', { ...options, timeZone: CARACAS_TIME_ZONE });
}

/** Solo la hora: «10:00 a. m.» */
export function formatTime(value: DateInput): string {
  return new Date(value).toLocaleTimeString('es-VE', { timeStyle: 'short', timeZone: CARACAS_TIME_ZONE });
}

/** Día del calendario de Caracas: «2026-10-05». */
export function caracasDateKey(value: DateInput): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: CARACAS_TIME_ZONE });
}
