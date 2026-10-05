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

const countedSearches = new Set<string>();

/**
 * «Apariciones en búsquedas»: qué médicos se mostraron en una página de
 * resultados y con qué especialidad o municipio filtrados. Nunca el texto que
 * escribió la persona. Una vez por resultado y por página cargada, y solo con
 * el consentimiento de análisis.
 */
export function trackSearchAppearances(professionalIds: string[], filters: { specialty?: string; municipality?: string } = {}) {
  if (!hasAnalyticsConsent()) return;
  const ids = professionalIds.filter((id, index) => professionalIds.indexOf(id) === index).slice(0, 60);
  if (!ids.length) return;
  const key = `${ids.join(',')}|${filters.specialty ?? ''}|${filters.municipality ?? ''}`;
  if (countedSearches.has(key)) return;
  countedSearches.add(key);
  api
    .post('/analytics/search-appearances', {
      professionalIds: ids,
      specialty: filters.specialty || undefined,
      municipality: filters.municipality || undefined,
    })
    .catch(() => undefined);
}
