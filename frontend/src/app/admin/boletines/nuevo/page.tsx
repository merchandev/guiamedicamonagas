'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { newsletterApi, type CampaignContent, type NewsletterBlock, type TemplateSummary } from '@/lib/newsletter';

const BLOCK_LABEL: Record<NewsletterBlock['type'], string> = {
  heading: 'Título',
  paragraph: 'Párrafo',
  button: 'Botón',
  image: 'Imagen',
  divider: 'Separador',
};

function emptyBlock(type: NewsletterBlock['type']): NewsletterBlock {
  switch (type) {
    case 'heading':
      return { type, text: '' };
    case 'paragraph':
      return { type, text: '' };
    case 'button':
      return { type, text: '', url: '' };
    case 'image':
      return { type, url: '', alt: '' };
    case 'divider':
      return { type };
  }
}

export default function NuevoBoletinPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [subject, setSubject] = useState('');
  const [mode, setMode] = useState<'BLOCKS' | 'HTML'>('BLOCKS');
  const [blocks, setBlocks] = useState<NewsletterBlock[]>([{ type: 'heading', text: '' }, { type: 'paragraph', text: '' }]);
  const [rawHtml, setRawHtml] = useState('');
  const [audienceList, setAudienceList] = useState(true);
  const [audiencePatients, setAudiencePatients] = useState(false);
  const [audienceProfessionals, setAudienceProfessionals] = useState(false);

  const [estimate, setEstimate] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');

  const dto = useMemo<CampaignContent>(
    () => ({
      subject,
      contentMode: mode,
      blocks: mode === 'BLOCKS' ? blocks : undefined,
      rawHtml: mode === 'HTML' ? rawHtml : undefined,
      audienceList,
      audiencePatients,
      audienceProfessionals,
    }),
    [subject, mode, blocks, rawHtml, audienceList, audiencePatients, audienceProfessionals],
  );

  // Estimación de destinatarios (solo al cambiar la audiencia, no en cada tecla).
  useEffect(() => {
    let active = true;
    newsletterApi
      .estimate({ subject: '', contentMode: 'BLOCKS', audienceList, audiencePatients, audienceProfessionals })
      .then((r) => active && setEstimate(r.total))
      .catch(() => active && setEstimate(null));
    return () => {
      active = false;
    };
  }, [audienceList, audiencePatients, audienceProfessionals]);

  // Vista previa (con pequeño retardo para no llamar en cada tecla).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPreview = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      newsletterApi
        .preview(dto)
        .then((r) => setPreviewHtml(r.html))
        .catch(() => undefined);
    }, 400);
  }, [dto]);

  useEffect(() => {
    refreshPreview();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refreshPreview]);

  const updateBlock = (i: number, patch: Partial<NewsletterBlock>) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? ({ ...b, ...patch } as NewsletterBlock) : b)));
  const removeBlock = (i: number) => setBlocks((bs) => bs.filter((_, idx) => idx !== i));
  const moveBlock = (i: number, dir: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const copy = [...bs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const addBlock = (type: NewsletterBlock['type']) => setBlocks((bs) => [...bs, emptyBlock(type)]);

  // Plantillas disponibles.
  useEffect(() => {
    newsletterApi.listTemplates().then(setTemplates).catch(() => undefined);
  }, []);

  const noAudience = !audienceList && !audiencePatients && !audienceProfessionals;

  const applyTemplate = async (id: string) => {
    if (!id) return;
    try {
      const t = await newsletterApi.getTemplate(id);
      setSubject(t.subject);
      setMode(t.contentMode);
      if (t.contentMode === 'BLOCKS') setBlocks(t.blocks ?? []);
      else setRawHtml(t.rawHtml ?? '');
      setInfo(`Plantilla «${t.name}» cargada.`);
    } catch {
      setError('No se pudo cargar la plantilla.');
    }
  };

  const saveAsTemplate = async () => {
    const name = window.prompt('Nombre de la plantilla:');
    if (!name?.trim()) return;
    try {
      await newsletterApi.saveTemplate({ ...dto, name: name.trim() });
      setInfo(`Plantilla «${name.trim()}» guardada.`);
      newsletterApi.listTemplates().then(setTemplates).catch(() => undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la plantilla.');
    }
  };

  const sendTest = async () => {
    if (!user?.email) return;
    setError(null);
    setInfo(null);
    setTesting(true);
    try {
      await newsletterApi.test({ ...dto, to: user.email });
      setInfo(`Enviamos una prueba a ${user.email}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar la prueba.');
    } finally {
      setTesting(false);
    }
  };

  const send = async (schedule: boolean) => {
    setError(null);
    setInfo(null);
    const count = estimate ?? 0;
    if (schedule) {
      if (!scheduledAt) {
        setError('Elige la fecha y hora para programar el envío.');
        return;
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        setError('La fecha de programación debe ser futura.');
        return;
      }
      if (!window.confirm(`¿Programar el envío a ${count} destinatario(s) para ${new Date(scheduledAt).toLocaleString('es-VE')}?`))
        return;
    } else if (!window.confirm(`¿Enviar el boletín a ${count} destinatario(s)? Esta acción no se puede deshacer.`)) {
      return;
    }
    setSending(true);
    try {
      const res = await newsletterApi.send({ ...dto, scheduledAt: schedule ? new Date(scheduledAt).toISOString() : undefined });
      router.push(`/admin/boletines/${res.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar el boletín.');
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Nuevo boletín</h1>
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Columna de edición */}
        <div className="space-y-5">
          <div className="card space-y-4 p-5">
            <Input label="Asunto" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />

            <div>
              <p className="mb-2 text-sm font-medium text-ink-800">Audiencia</p>
              <div className="space-y-2">
                <Switch checked={audienceList} onChange={setAudienceList} label="Lista propia de suscriptores" />
                <Switch checked={audiencePatients} onChange={setAudiencePatients} label="Pacientes registrados" />
                <Switch checked={audienceProfessionals} onChange={setAudienceProfessionals} label="Médicos registrados" />
              </div>
              <p className="mt-2 text-sm text-ink-500">
                {noAudience ? 'Elige al menos una audiencia.' : `Aprox. ${estimate ?? '…'} destinatario(s) (sin contar bajas).`}
              </p>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-4 inline-flex rounded-lg border border-ink-200 p-1">
              <button
                type="button"
                onClick={() => setMode('BLOCKS')}
                className={`rounded-md px-3 py-1.5 text-sm ${mode === 'BLOCKS' ? 'bg-pine-700 text-white' : 'text-ink-700'}`}
              >
                Bloques
              </button>
              <button
                type="button"
                onClick={() => setMode('HTML')}
                className={`rounded-md px-3 py-1.5 text-sm ${mode === 'HTML' ? 'bg-pine-700 text-white' : 'text-ink-700'}`}
              >
                HTML
              </button>
            </div>

            {mode === 'BLOCKS' ? (
              <div className="space-y-4">
                {blocks.map((b, i) => (
                  <div key={i} className="rounded-lg border border-ink-100 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">{BLOCK_LABEL[b.type]}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => moveBlock(i, -1)} aria-label="Subir">↑</Button>
                        <Button variant="ghost" size="sm" onClick={() => moveBlock(i, 1)} aria-label="Bajar">↓</Button>
                        <Button variant="ghost" size="sm" onClick={() => removeBlock(i)} aria-label="Quitar">✕</Button>
                      </div>
                    </div>
                    {(b.type === 'heading' || b.type === 'paragraph') && (
                      <Textarea
                        value={b.text}
                        onChange={(e) => updateBlock(i, { text: e.target.value })}
                        rows={b.type === 'heading' ? 1 : 3}
                        placeholder={b.type === 'heading' ? 'Título' : 'Escribe el texto…'}
                      />
                    )}
                    {b.type === 'button' && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input value={b.text} onChange={(e) => updateBlock(i, { text: e.target.value })} placeholder="Texto del botón" />
                        <Input value={b.url} onChange={(e) => updateBlock(i, { url: e.target.value })} placeholder="https://…" />
                      </div>
                    )}
                    {b.type === 'image' && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input value={b.url} onChange={(e) => updateBlock(i, { url: e.target.value })} placeholder="URL de la imagen (https://…)" />
                        <Input value={b.alt ?? ''} onChange={(e) => updateBlock(i, { alt: e.target.value })} placeholder="Texto alternativo" />
                      </div>
                    )}
                    {b.type === 'divider' && <p className="text-sm text-ink-400">Línea separadora.</p>}
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {(['heading', 'paragraph', 'button', 'image', 'divider'] as const).map((t) => (
                    <Button key={t} variant="outline" size="sm" onClick={() => addBlock(t)}>
                      + {BLOCK_LABEL[t]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <Textarea
                value={rawHtml}
                onChange={(e) => setRawHtml(e.target.value)}
                rows={16}
                placeholder="<h1>Hola</h1><p>Tu contenido en HTML…</p>"
                hint="HTML libre. Se muestra dentro de la plantilla con la marca. Tú eres responsable de que se vea bien."
              />
            )}
          </div>

          {/* Plantillas */}
          <div className="card space-y-3 p-5">
            <p className="text-sm font-medium text-ink-800">Plantillas</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem] flex-1">
                <Select
                  ariaLabel="Cargar plantilla"
                  value=""
                  onChange={applyTemplate}
                  placeholder={templates.length ? 'Cargar una plantilla…' : 'Sin plantillas guardadas'}
                  options={templates.map((t) => ({ value: t.id, label: t.name }))}
                />
              </div>
              <Button variant="outline" onClick={saveAsTemplate}>
                Guardar como plantilla
              </Button>
            </div>
          </div>

          {/* Programación y envío */}
          <div className="card space-y-4 p-5">
            <div>
              <label htmlFor="nl-sched" className="mb-1 block text-sm font-medium text-ink-800">
                Programar envío (opcional)
              </label>
              <input
                id="nl-sched"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="block w-full rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-sm focus:border-pine-600 focus:outline-none focus:ring-2 focus:ring-pine-600/20"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={sendTest} loading={testing} disabled={!user?.email}>
                Enviar prueba a mi correo
              </Button>
              {scheduledAt ? (
                <Button onClick={() => send(true)} loading={sending} disabled={noAudience}>
                  Programar envío
                </Button>
              ) : (
                <Button onClick={() => send(false)} loading={sending} disabled={noAudience}>
                  Enviar ahora
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Columna de vista previa */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-800">Vista previa</p>
          <div className="card overflow-hidden p-0">
            <iframe title="Vista previa del boletín" srcDoc={previewHtml} className="h-[640px] w-full border-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
