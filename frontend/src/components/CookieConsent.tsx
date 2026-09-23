'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { COOKIE_CONSENT_STORAGE_KEY } from '@/lib/analytics';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const STORAGE_KEY = COOKIE_CONSENT_STORAGE_KEY;
const OPEN_EVENT = 'gmm:open-cookie-preferences';

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
  marketingDescription?: string;
}

function randomId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function openCookiePreferences() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPEN_EVENT));
  }
}

export default function CookieConsent() {
  const [stored, setStored] = useState<StoredConsent | null>(null);
  const [config, setConfig] = useState<CookieConfig | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: StoredConsent = JSON.parse(raw);
        setStored(parsed);
        setAnalytics(parsed.analytics);
        setMarketing(parsed.marketing);
      } else {
        setShowBanner(true);
      }
    } catch {
      setShowBanner(true);
    }

    api.get<CookieConfig>('/cookie-consent/config').then(setConfig).catch(() => undefined);

    const onOpen = () => setShowModal(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const persist = async (next: { analytics: boolean; marketing: boolean }) => {
    const subjectId = stored?.subjectId ?? randomId();
    const record: StoredConsent = { subjectId, ...next, decidedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    setStored(record);
    setShowBanner(false);
    setShowModal(false);
    await api.post('/cookie-consent', { subjectId, analytics: next.analytics, marketing: next.marketing }).catch(() => undefined);
  };

  const acceptAll = () => persist({ analytics: true, marketing: true });
  const rejectNonEssential = () => persist({ analytics: false, marketing: false });
  const savePreferences = () => persist({ analytics, marketing });

  return (
    <>
      {showBanner && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-200 bg-white p-4 shadow-card sm:p-6">
          <div className="container-page flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-700">
              {config?.message ??
                'Usamos cookies necesarias para el funcionamiento del sitio y, con tu permiso, cookies de análisis y marketing.'}
            </p>
            <div className="flex flex-shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
                Personalizar
              </Button>
              <Button variant="ghost" size="sm" onClick={rejectNonEssential}>
                Rechazar
              </Button>
              <Button size="sm" onClick={acceptAll}>
                Aceptar todo
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
                {config?.necessaryDescription ?? 'Imprescindibles para que el sitio funcione. Siempre activas.'}
              </p>
            </div>
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500">Siempre activas</span>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-lg border border-ink-100 p-4">
            <div>
              <p className="text-sm font-semibold text-ink-900">Análisis</p>
              <p className="text-xs text-ink-500">
                {config?.analyticsDescription ?? 'Nos ayudan a entender cómo se usa el sitio para mejorarlo.'}
              </p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-ink-300 text-pine-700 focus:ring-pine-600"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
            />
          </label>

          <label className="flex items-start justify-between gap-4 rounded-lg border border-ink-100 p-4">
            <div>
              <p className="text-sm font-semibold text-ink-900">Marketing</p>
              <p className="text-xs text-ink-500">
                {config?.marketingDescription ?? 'Usadas para mostrar contenido y anuncios relevantes.'}
              </p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-ink-300 text-pine-700 focus:ring-pine-600"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={rejectNonEssential}>
              Rechazar todo
            </Button>
            <Button onClick={savePreferences}>Guardar preferencias</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
