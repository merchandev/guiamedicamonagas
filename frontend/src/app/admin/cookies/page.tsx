'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';

interface CookieConfig {
  message: string;
  necessaryDescription?: string;
  analyticsDescription?: string;
  marketingDescription?: string;
}

export default function AdminCookiesPage() {
  const [config, setConfig] = useState<CookieConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<CookieConfig>('/cookie-consent/config').then(setConfig);
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.put<CookieConfig>('/cookie-consent/config', config);
      setConfig(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  };

  if (!config) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Configuración de cookies</h1>
      <p className="text-ink-600">
        Este texto se muestra en el aviso de cookies que ven todos los visitantes del sitio.
      </p>

      <form onSubmit={save} className="card space-y-4 p-6">
        {error && <Alert tone="error">{error}</Alert>}
        {saved && <Alert tone="success">Configuración guardada</Alert>}
        <Textarea
          label="Mensaje principal del aviso"
          rows={3}
          value={config.message}
          onChange={(e) => setConfig({ ...config, message: e.target.value })}
        />
        <Textarea
          label="Descripción — cookies necesarias"
          rows={2}
          value={config.necessaryDescription ?? ''}
          onChange={(e) => setConfig({ ...config, necessaryDescription: e.target.value })}
        />
        <Textarea
          label="Descripción — cookies de análisis"
          rows={2}
          value={config.analyticsDescription ?? ''}
          onChange={(e) => setConfig({ ...config, analyticsDescription: e.target.value })}
        />
        <Textarea
          label="Descripción — cookies de marketing"
          rows={2}
          value={config.marketingDescription ?? ''}
          onChange={(e) => setConfig({ ...config, marketingDescription: e.target.value })}
        />
        <Button type="submit" loading={submitting}>
          Guardar cambios
        </Button>
      </form>
    </div>
  );
}
