'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';

/** Alta pública al boletín (doble opt-in): se envía un correo de confirmación. */
export function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/newsletter/subscribe', { email: email.trim() });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar la suscripción.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-ink-900">Boletín</h4>
      <p className="mt-3 text-sm text-ink-600">Novedades y salud en tu correo. Puedes darte de baja cuando quieras.</p>
      {done ? (
        <p className="mt-3 text-sm text-pine-700">
          Revisa tu correo y confirma tu suscripción. Si no te llega, mira también la carpeta de spam.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            aria-label="Tu correo electrónico"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" size="sm" loading={busy} className="w-full">
            Suscribirme
          </Button>
        </form>
      )}
    </div>
  );
}
