'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { COOKIE_CONSENT_STORAGE_KEY } from '@/lib/analytics';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const STORAGE_KEY = COOKIE_CONSENT_STORAGE_KEY;
const OPEN_EVENT = 'gmm:open-cookie-preferences';

// El sitio no usa cookies publicitarias: no hay categoría de marketing que
// aceptar. El campo se conserva en false por compatibilidad con el registro
// de consentimientos del servidor.
interface StoredConsent {
  subjectId: string;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

interface CookieConfig {
  message: string;
  necessaryDescription?: string;
  analyticsDescription?: string;
}

function randomId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// La decisión vive en localStorage. Se lee con useSyncExternalStore: en el
// servidor (y durante la hidratación) no se conoce y el aviso no se dibuja;
// en el navegador aparece solo si no hay una decisión guardada. Si el
// navegador no deja guardar (modo privado estricto), la decisión vale para
// esta visita.
const consentListeners = new Set<() => void>();
let unsavedConsent: string | null = null;

function subscribeConsent(listener: () => void) {
  consentListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    consentListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readConsentRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? unsavedConsent;
  } catch {
    return unsavedConsent;
  }
}

function writeConsent(record: StoredConsent) {
  const raw = JSON.stringify(record);
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    unsavedConsent = raw;
  }
  consentListeners.forEach((listener) => listener());
}

function parseConsent(raw: string | null): StoredConsent | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredConsent;
  } catch {
    return null;
  }
}

export function openCookiePreferences() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPEN_EVENT));
  }
}

export default function CookieConsent() {
  // undefined = todavía no se sabe (servidor o hidratación).
  const raw = useSyncExternalStore(subscribeConsent, readConsentRaw, () => undefined);
  const stored = useMemo(() => (raw === undefined ? null : parseConsent(raw)), [raw]);
  const showBanner = raw !== undefined && stored === null;
  const [config, setConfig] = useState<CookieConfig | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  // El interruptor del diálogo parte siempre de la decisión guardada.
  const openModal = useCallback(() => {
    setAnalytics(parseConsent(readConsentRaw())?.analytics ?? false);
    setShowModal(true);
  }, []);

  useEffect(() => {
    api.get<CookieConfig>('/cookie-consent/config').then(setConfig).catch(() => undefined);
    window.addEventListener(OPEN_EVENT, openModal);
    return () => window.removeEventListener(OPEN_EVENT, openModal);
  }, [openModal]);

  const persist = async (acceptAnalytics: boolean) => {
    const subjectId = stored?.subjectId ?? randomId();
    const record: StoredConsent = { subjectId, analytics: acceptAnalytics, marketing: false, decidedAt: new Date().toISOString() };
    writeConsent(record);
    setAnalytics(acceptAnalytics);
    setShowModal(false);
    await api.post('/cookie-consent', { subjectId, analytics: acceptAnalytics, marketing: false }).catch(() => undefined);
  };

  return (
    <>
      {showBanner && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-200 bg-white p-4 shadow-card sm:p-6">
          <div className="container-page flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-700">
              {config?.message ??
                'Usamos solo lo necesario para que el sitio funcione y sea seguro. Con tu permiso, también contamos visitas y clics de forma anónima. No usamos publicidad ni rastreo de terceros.'}{' '}
              <Link href="/cookies" className="font-medium text-pine-700 underline">
                Política de cookies
              </Link>
            </p>
            <div className="flex flex-shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={openModal}>
                Configurar
              </Button>
              <Button variant="outline" size="sm" onClick={() => persist(false)}>
                Rechazar no esenciales
              </Button>
              <Button size="sm" onClick={() => persist(true)}>
                Aceptar todas
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Preferencias de cookies">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-ink-100 p-4">
            <div>
              <p className="text-sm font-semibold text-ink-900">Necesarias</p>
              <p className="text-xs text-ink-500">
                {config?.necessaryDescription ?? 'Imprescindibles para iniciar sesión y proteger tu cuenta. Siempre activas.'}
              </p>
            </div>
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500">Siempre activas</span>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-lg border border-ink-100 p-4">
            <div>
              <p className="text-sm font-semibold text-ink-900">Análisis</p>
              <p className="text-xs text-ink-500">
                {config?.analyticsDescription ??
                  'Conteos anónimos de visitas a perfiles, clics en los botones de contacto y apariciones de cada perfil en los resultados del directorio, sin tu dirección IP ni tu navegador ni lo que escribes en el buscador.'}
              </p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-ink-300 text-pine-700 focus:ring-pine-600"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
            />
          </label>

          <p className="text-xs text-ink-500">
            Este sitio no usa cookies publicitarias ni de seguimiento entre sitios.{' '}
            <Link href="/cookies" className="font-medium text-pine-700 underline" onClick={() => setShowModal(false)}>
              Política de cookies
            </Link>
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => persist(false)}>
              Rechazar no esenciales
            </Button>
            <Button onClick={() => persist(analytics)}>Guardar preferencias</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
