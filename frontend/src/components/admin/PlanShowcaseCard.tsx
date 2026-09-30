'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { YouTubePresentation } from '@/components/YouTubePresentation';
import { parseYouTubeVideoId, youTubeShortUrl } from '@/lib/youtube';

/**
 * Video de muestra que acompaña al plan Marca Médica en /planes. Debe ser un
 * video real producido por la Guía; sin él, la página muestra una ilustración.
 */
export function PlanShowcaseCard() {
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ sampleVideoId: string | null }>('/subscriptions/showcase')
      .then((data) => {
        setCurrent(data.sampleVideoId);
        setUrl(data.sampleVideoId ? youTubeShortUrl(data.sampleVideoId) : '');
      })
      .catch(() => setError('No se pudo cargar el video de muestra.'));
  }, []);

  const draft = parseYouTubeVideoId(url);

  const save = async (next: string | null) => {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const result = await api.put<{ sampleVideoId: string | null }>('/subscriptions/admin/showcase', { url: next });
      setCurrent(result.sampleVideoId);
      setUrl(result.sampleVideoId ? youTubeShortUrl(result.sampleVideoId) : '');
      setSaved(result.sampleVideoId ? 'Video guardado. Ya se ve en la página de planes (puede tardar un minuto).' : 'Video quitado: la página de planes vuelve a mostrar la ilustración.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el video.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-3 p-6" aria-labelledby="muestra-marca-medica">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="muestra-marca-medica" className="font-semibold text-ink-900">
          Video de muestra de Marca Médica
        </h2>
        {current !== undefined && <Badge tone={current ? 'pine' : 'amber'}>{current ? 'Publicado' : 'Sin video: se ve una ilustración'}</Badge>}
      </div>
      <p className="text-sm text-ink-600">
        Se muestra dentro del teléfono de la sección Marca Médica en «Planes y precios». Usa un video real producido por la
        Guía, de 20 a 40 segundos y preferiblemente vertical (YouTube Shorts). Se carga desde YouTube solo cuando el visitante
        pulsa «Ver el ejemplo real».
      </p>
      {saved && (
        <div role="status">
          <Alert tone="success">{saved}</Alert>
        </div>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft) void save(url.trim());
        }}
      >
        <Input
          label="Enlace del video en YouTube"
          name="muestra-url"
          placeholder="https://youtube.com/shorts/…"
          maxLength={300}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={url.trim() && !draft ? 'Pega un enlace de YouTube (youtube.com/shorts/…, youtu.be/… o youtube.com/watch?v=…).' : undefined}
        />
        {draft && <YouTubePresentation key={draft} videoId={draft} title="Video de muestra de Marca Médica" className="max-w-md" />}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving} disabled={!draft || draft === current}>
            Guardar video
          </Button>
          {current && (
            <Button type="button" variant="outline" disabled={saving} onClick={() => void save(null)}>
              Quitar video
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
