/** Genera un evento .ics mínimo (RFC 5545) para adjuntar a un correo de cita confirmada. */
export function buildAppointmentIcs(opts: {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  location?: string;
  description?: string;
}): string {
  const escape = (value: string) => value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Guia Medica Monagas//ES',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(opts.startsAt)}`,
    `DTEND:${fmt(opts.endsAt)}`,
    `SUMMARY:${escape(opts.summary)}`,
    opts.location ? `LOCATION:${escape(opts.location)}` : '',
    opts.description ? `DESCRIPTION:${escape(opts.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}
