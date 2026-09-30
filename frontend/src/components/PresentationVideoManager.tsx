'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { YouTubePresentation } from '@/components/YouTubePresentation';
import { parseYouTubeVideoId, youTubeShortUrl } from '@/lib/youtube';
import type { PlanTier } from '@/lib/types';

/**
 * Video de presentación de la ficha (plan Marca Médica). Con otro plan se muestra
 * lo que incluye Marca Médica; si el médico bajó de plan, su video sigue guardado
 * (oculto en la ficha) y lo puede quitar.
 */
export function PresentationVideoManager({ planTier, initialVideoId }: { planTier: PlanTier; initialVideoId: string | null }) {
  const [videoId, setVideoId] = useState<string | null>(initialVideoId);
  const [url, setUrl] = useState(initialVideoId ? youTubeShortUrl(initialVideoId) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isAgency = planTier === 'AGENCY';
  const draftId = parseYouTubeVideoId(url);

  const save = async (next: string | null) => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const saved = await api.put<{ presentationVideoId: string | null }>('/professionals/me/presentation-video', { url: next });
      setVideoId(saved.presentationVideoId);
      setUrl(saved.presentationVideoId ? youTubeShortUrl(saved.presentationVideoId) : '');
      setSuccess(saved.presentationVideoId ? 'Video guardado: ya se ve en tu ficha.' : 'Quitaste el video de tu ficha.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el video');
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (draftId) void save(url.trim());
  };

  if (!isAgency) {
    return (
      <div className="card space-y-3 border-gold-200 bg-gold-50/40 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Video de presentación</h2>
        <p className="text-sm text-ink-600">
          Con el plan <strong>Marca Médica</strong> producimos contigo 2 videos profesionales cada mes (guion, grabación,
          edición y subtítulos) y uno de ellos puede ser el video de presentación de tu ficha.
        </p>
        {videoId && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-100 bg-white p-3 text-sm">
            <p className="text-ink-600">Tu video sigue guardado, pero no se muestra con tu plan actual.</p>
            <Button variant="ghost" size="sm" loading={saving} onClick={() => void save(null)}>
              Quitar video
            </Button>
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Link href="/dashboard/pagos">
          <Button>Ver planes</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="card space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Video de presentación</h2>
        <p className="mt-1 text-sm text-ink-600">
          Tu plan Marca Médica incluye 2 videos profesionales cada mes, producidos con Guía Médica Monagas. Cuando estén en
          YouTube, pega aquí el enlace del que quieras mostrar en tu ficha.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {success && (
        <div role="status">
          <Alert tone="success">{success}</Alert>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <Input
          label="Enlace del video en YouTube"
          placeholder="https://youtu.be/…"
          maxLength={300}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={url.trim() && !draftId ? 'Pega un enlace de YouTube (youtu.be/… o youtube.com/watch?v=…).' : undefined}
          hint="El video debe ser público u oculto (no privado) y permitir que se inserte en otros sitios."
        />
        <Button type="submit" loading={saving} disabled={!draftId || draftId === videoId}>
          {videoId ? 'Cambiar video' : 'Guardar video'}
        </Button>
      </form>

      {(draftId ?? videoId) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            {draftId && draftId !== videoId ? 'Vista previa (aún sin guardar)' : 'Así se ve en tu ficha'}
          </p>
          <YouTubePresentation key={draftId ?? videoId} videoId={(draftId ?? videoId)!} title="Video de presentación" className="max-w-xl" />
        </div>
      )}

      {videoId && (
        <Button variant="ghost" size="sm" loading={saving} onClick={() => void save(null)}>
          Quitar video de mi ficha
        </Button>
      )}
    </div>
  );
}
