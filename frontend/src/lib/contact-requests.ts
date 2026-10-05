/** «Quiero que me contacte»: estados y canales (mismos valores que el backend). */

export type ContactRequestStatus = 'OPEN' | 'CONTACTED' | 'CLOSED' | 'WITHDRAWN' | 'EXPIRED';
export type ContactChannel = 'PHONE' | 'WHATSAPP' | 'EMAIL';

export const CONTACT_REQUEST_STATUS: Record<ContactRequestStatus, { label: string; tone: 'amber' | 'pine' | 'neutral' | 'red' }> = {
  OPEN: { label: 'Por atender', tone: 'amber' },
  CONTACTED: { label: 'Contactado', tone: 'pine' },
  CLOSED: { label: 'Cerrado', tone: 'neutral' },
  WITHDRAWN: { label: 'Retirado', tone: 'neutral' },
  EXPIRED: { label: 'Vencido', tone: 'neutral' },
};

export const CONTACT_CHANNEL_LABEL: Record<ContactChannel, string> = {
  PHONE: 'Llamada',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Correo',
};
