'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';

interface GlobalSeo {
  siteName: string;
  titleSeparator: string;
  allowIndexing: boolean;
  defaultOgImageUrl?: string;
}

interface PageSeo {
  id?: string;
  path: string;
  title?: string;
  metaDescription?: string;
  focusKeyword?: string;
  ogImageUrl?: string;
  noIndex?: boolean;
}

const KNOWN_PATHS = ['/', '/medicos', '/especialidades', '/farmacias'];

export default function AdminSeoPage() {
  const [tab, setTab] = useState<'global' | 'pages'>('global');
  const [global, setGlobal] = useState<GlobalSeo | null>(null);
  const [pages, setPages] = useState<PageSeo[]>([]);
  const [selectedPath, setSelectedPath] = useState(KNOWN_PATHS[0]);
  const [pageForm, setPageForm] = useState<PageSeo>({ path: KNOWN_PATHS[0] });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([api.get<GlobalSeo>('/seo/global'), api.get<PageSeo[]>('/seo/pages')]).then(([g, p]) => {
      setGlobal(g);
      setPages(p);
    });
  }, []);

  useEffect(() => {
    const existing = pages.find((p) => p.path === selectedPath);
    setPageForm(existing ?? { path: selectedPath });
  }, [selectedPath, pages]);

  const saveGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!global) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.put<GlobalSeo>('/seo/global', global);
      setGlobal(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const savePage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Solo los campos editables: la fila guardada trae id y fechas, y un
      // enlace de imagen vacío no es una URL válida. Vacío (null) = borrar.
      await api.put('/seo/pages', {
        path: pageForm.path,
        title: pageForm.title || null,
        metaDescription: pageForm.metaDescription || null,
        focusKeyword: pageForm.focusKeyword || null,
        ogImageUrl: pageForm.ogImageUrl || null,
        noIndex: pageForm.noIndex ?? false,
      });
      const refreshed = await api.get<PageSeo[]>('/seo/pages');
      setPages(refreshed);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  };

  if (!global) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">SEO del sitio</h1>
        {saved && <Badge tone="pine">Guardado</Badge>}
      </div>

      <div className="flex gap-1 border-b border-ink-100">
        {(['global', 'pages'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t ? 'border-pine-700 text-pine-800' : 'border-transparent text-ink-500'
            }`}
          >
            {t === 'global' ? 'Ajustes generales' : 'Páginas'}
          </button>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {tab === 'global' ? (
        <form onSubmit={saveGlobal} className="card space-y-4 p-6">
          <Input
            label="Nombre del sitio"
            value={global.siteName}
            onChange={(e) => setGlobal({ ...global, siteName: e.target.value })}
          />
          <Select
            label="Separador de título"
            value={global.titleSeparator}
            onChange={(value) => setGlobal({ ...global, titleSeparator: value })}
            options={[
              { value: '-', label: '-' },
              { value: '|', label: '|' },
              { value: '•', label: '•' },
            ]}
          />
          <Input
            label="Imagen OG por defecto (URL)"
            value={global.defaultOgImageUrl ?? ''}
            onChange={(e) => setGlobal({ ...global, defaultOgImageUrl: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={global.allowIndexing}
              onChange={(e) => setGlobal({ ...global, allowIndexing: e.target.checked })}
              className="h-4 w-4 rounded border-ink-300 text-pine-700"
            />
            Permitir que los motores de búsqueda indexen el sitio
          </label>
          <Button type="submit" loading={submitting}>
            Guardar cambios
          </Button>
        </form>
      ) : (
        <form onSubmit={savePage} className="card space-y-4 p-6">
          <Select
            label="Página"
            value={selectedPath}
            onChange={setSelectedPath}
            options={KNOWN_PATHS.map((p) => ({ value: p, label: p }))}
          />
          <Input
            label="Título SEO"
            hint="Recomendado: 40-60 caracteres"
            value={pageForm.title ?? ''}
            onChange={(e) => setPageForm({ ...pageForm, title: e.target.value })}
          />
          <Textarea
            label="Meta descripción"
            rows={3}
            hint="Recomendado: 120-156 caracteres"
            value={pageForm.metaDescription ?? ''}
            onChange={(e) => setPageForm({ ...pageForm, metaDescription: e.target.value })}
          />
          <Input
            label="Frase clave objetivo"
            value={pageForm.focusKeyword ?? ''}
            onChange={(e) => setPageForm({ ...pageForm, focusKeyword: e.target.value })}
          />
          <Input
            label="Imagen para redes sociales (URL)"
            value={pageForm.ogImageUrl ?? ''}
            onChange={(e) => setPageForm({ ...pageForm, ogImageUrl: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pageForm.noIndex ?? false}
              onChange={(e) => setPageForm({ ...pageForm, noIndex: e.target.checked })}
              className="h-4 w-4 rounded border-ink-300 text-pine-700"
            />
            No indexar esta página
          </label>
          <Button type="submit" loading={submitting}>
            Guardar cambios
          </Button>
        </form>
      )}
    </div>
  );
}
