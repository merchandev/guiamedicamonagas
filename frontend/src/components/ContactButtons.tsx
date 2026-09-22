'use client';

import { api } from '@/lib/api';

function track(eventType: string, resourceId: string) {
  api.post('/analytics/track', { eventType, resourceId }).catch(() => undefined);
}

export function WhatsAppButton({ professionalId, whatsapp }: { professionalId: string; whatsapp: string }) {
  const digits = whatsapp.replace(/[^\d]/g, '');
  const phoneIntl = digits.startsWith('58') ? digits : `58${digits.replace(/^0/, '')}`;
  return (
    <a
      href={`https://wa.me/${phoneIntl}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('WHATSAPP_CLICK', professionalId)}
      className="flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-sm font-semibold text-white hover:brightness-95"
    >
      Escribir por WhatsApp
    </a>
  );
}

export function PhoneButton({ professionalId, phone }: { professionalId: string; phone: string }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, '')}`}
      onClick={() => track('PHONE_CLICK', professionalId)}
      className="flex items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-800 hover:bg-ink-50"
    >
      Llamar: {phone}
    </a>
  );
}

export function WebsiteButton({ professionalId, website }: { professionalId: string; website: string }) {
  return (
    <a
      href={website}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('WEBSITE_CLICK', professionalId)}
      className="flex items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-800 hover:bg-ink-50"
    >
      Visitar sitio web
    </a>
  );
}

export function trackProfileView(professionalId: string) {
  track('PROFILE_VIEW', professionalId);
}
