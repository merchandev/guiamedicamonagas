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

/** «lunes, 5 de octubre…» → «Lunes, 5 de octubre…» (solo la primera letra). */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Solo la hora: «10:00 a. m.» */
export function formatTime(value: DateInput): string {
  return new Date(value).toLocaleTimeString('es-VE', { timeStyle: 'short', timeZone: CARACAS_TIME_ZONE });
}

/** Día del calendario de Caracas: «2026-10-05». */
export function caracasDateKey(value: DateInput): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: CARACAS_TIME_ZONE });
}

const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: CARACAS_TIME_ZONE, timeZoneName: 'longOffset' });

/** Desfase de Caracas respecto de UTC en ese instante, en minutos (ej. −240). */
export function caracasOffsetMinutes(value: DateInput): number {
  const name = offsetFormat.formatToParts(new Date(value)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
}

/**
 * El calendario trabaja en «hora de pared» de Caracas escrita como UTC, para
 * no depender de la zona del navegador: las 10:00 de Caracas son «10:00Z».
 */
export function toCaracasWall(value: DateInput): Date {
  const instant = new Date(value);
  return new Date(instant.getTime() + caracasOffsetMinutes(instant) * 60_000);
}

/** El camino inverso: «10:00Z» de pared → el instante real (14:00 UTC). */
export function fromCaracasWall(wall: Date): Date {
  return new Date(wall.getTime() - caracasOffsetMinutes(wall) * 60_000);
}

/** «2026-10-05» + «08:30» de Caracas → instante. */
export function caracasInstant(dateKey: string, time: string): Date {
  return fromCaracasWall(new Date(`${dateKey}T${time}:00Z`));
}

const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** «hace 5 minutos», «ayer»; pasada una semana, la fecha. */
export function timeAgo(value: DateInput, now: number = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return 'hace un momento';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86_400) return relative.format(Math.round(seconds / 86_400), 'day');
  return formatDate(value, { dateStyle: 'medium' });
}
