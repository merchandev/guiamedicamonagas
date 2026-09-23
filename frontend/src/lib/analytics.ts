import { api } from './api';

export const COOKIE_CONSENT_STORAGE_KEY = 'gmm_cookie_consent';

/** true solo si el visitante aceptó explícitamente las cookies de análisis. */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return raw ? JSON.parse(raw).analytics === true : false;
  } catch {
    return false;
  }
}

/**
 * Evento de estadística (vista de perfil, clic en WhatsApp...). Sin
 * consentimiento de análisis no se envía nada; con él, el servidor guarda
 * solo un conteo anónimo (sin IP ni navegador).
 */
export function trackEvent(eventType: string, resourceId: string) {
  if (!hasAnalyticsConsent()) return;
  api.post('/analytics/track', { eventType, resourceId }).catch(() => undefined);
}
