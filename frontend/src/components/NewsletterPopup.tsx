'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const SUBSCRIBED_KEY = 'nl.subscribed'; // localStorage: ya se suscribió (no volver a mostrar)
const LAST_SHOWN_KEY = 'nl.lastShown'; // localStorage: epoch ms de la última vez que apareció
const SESSION_KEY = 'nl.popupSeen'; // sessionStorage: ya apareció en esta sesión
const DAY_MS = 24 * 60 * 60 * 1000;
const DELAY_MS = 10_000;

function readLS(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* modo privado / bloqueado */
  }
}

/**
 * Popup de suscripción al boletín. Aparece a los ~10 s UNA vez por sesión y como
 * mucho cada 24 h, solo a visitantes no registrados que aún no se suscribieron.
 */
export function NewsletterPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Nunca a usuarios con sesión (ya están registrados) ni si ya se suscribió.
    if (user) return;
    if (readLS(SUBSCRIBED_KEY) === '1') return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === '1') return;
    } catch {
      /* ignorar */
    }
    const last = Number(readLS(LAST_SHOWN_KEY) ?? 0);
    if (last && Date.now() - last < DAY_MS) return;

    const timer = window.setTimeout(() => {
      setOpen(true);
      writeLS(LAST_SHOWN_KEY, String(Date.now()));
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        /* ignorar */
      }
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/newsletter/subscribe', { email: email.trim() });
      writeLS(SUBSCRIBED_KEY, '1');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar la suscripción.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink-950/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nl-popup-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-ink-900/5 animate-[nlpop_.25s_ease-out]"
      >
        <style>{`@keyframes nlpop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}`}</style>

        <button
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
        >
          ✕
        </button>

        {/* Cabecera con degradado de marca */}
        <div className="bg-gradient-to-br from-pine-700 to-pine-900 px-6 pb-7 pt-8 text-white">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-2xl">✉️</div>
          <h2 id="nl-popup-title" className="font-display text-xl font-semibold leading-snug">
            {done ? '¡Gracias por suscribirte!' : 'Recibe salud y novedades en tu correo'}
          </h2>
          <p className="mt-1 text-sm text-white/80">
            {done
              ? 'Te enviamos un correo para confirmar tu suscripción. Revisa también la carpeta de spam.'
              : 'Consejos de salud, médicos nuevos y novedades de MonagasMed. Sin spam; te das de baja cuando quieras.'}
          </p>
        </div>

        {!done && (
          <form onSubmit={submit} className="space-y-3 px-6 py-6">
            <input
              ref={inputRef}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              aria-label="Tu correo electrónico"
              className="block w-full rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-sm placeholder:text-ink-400 focus:border-pine-600 focus:outline-none focus:ring-2 focus:ring-pine-600/20"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-pine-700 text-sm font-semibold text-white transition hover:bg-pine-800 disabled:opacity-60"
            >
              {busy ? 'Enviando…' : 'Suscribirme'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="block w-full text-center text-xs text-ink-400 hover:text-ink-600"
            >
              Ahora no
            </button>
          </form>
        )}

        {done && (
          <div className="px-6 py-6">
            <button
              onClick={() => setOpen(false)}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-pine-700 text-sm font-semibold text-white transition hover:bg-pine-800"
            >
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
