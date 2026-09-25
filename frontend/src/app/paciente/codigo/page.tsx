'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ALL_SCOPES, SCOPE_INFO, type PatientDataScope } from '@/lib/patient-scopes';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { brandQrSvg, downloadQrPng, svgDataUrl } from '@/lib/qr';

interface ShareCode {
  code: string | null;
  url: string | null;
  createdAt: string | null;
  scopes: PatientDataScope[];
}

const STEPS = [
  'Entrégale el código a tu médico o muéstrale el QR para que lo escanee con su teléfono.',
  'Tu médico te registra desde su panel y te ubica sin que tu nombre aparezca en ningún sitio público.',
  'Te llega un aviso. En «Permisos» ves quién te registró y puedes retirarle el acceso cuando quieras.',
];

export default function PatientShareCodePage() {
  const [data, setData] = useState<ShareCode | null>(null);
  const [scopes, setScopes] = useState<PatientDataScope[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'generate' | 'scopes' | 'download' | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  useEffect(() => {
    api
      .get<ShareCode>('/patients/me/share-code')
      .then((result) => {
        setData(result);
        setScopes(result.scopes);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu código'));
  }, []);

  // El QR se dibuja en el navegador: el código no viaja a ningún servicio externo.
  const qrSvg = useMemo(
    () => (data?.url ? brandQrSvg(data.url) : null),
    [data?.url],
  );

  const generate = async () => {
    setBusy('generate');
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<ShareCode>('/patients/me/share-code');
      setData(result);
      setMessage(data?.code ? 'Generaste un código nuevo: el anterior ya no funciona.' : 'Tu código está listo.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo generar el código');
    } finally {
      setBusy(null);
      setConfirmRotate(false);
    }
  };

  const saveScopes = async () => {
    setBusy('scopes');
    setError(null);
    setMessage(null);
    try {
      const result = await api.patch<ShareCode>('/patients/me/share-code', { scopes });
      setData(result);
      setScopes(result.scopes);
      setMessage('Guardado. Se aplica a los médicos que te registren de ahora en adelante.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setMessage('Código copiado.');
    } catch {
      setError('No se pudo copiar; selecciónalo y cópialo manualmente.');
    }
  };

  const downloadPng = async () => {
    if (!qrSvg || !data?.code) return;
    setBusy('download');
    try {
      await downloadQrPng(qrSvg, `codigo-paciente-${data.code}.png`);
    } catch {
      setError('No se pudo descargar el QR');
    } finally {
      setBusy(null);
    }
  };

  if (!data) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  const scopesChanged = scopes.slice().sort().join() !== data.scopes.slice().sort().join();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Mi código de paciente</h1>
        <p className="mt-1 text-sm text-ink-600">
          Los pacientes no tienen páginas públicas ni aparecen en buscadores. Este código es la forma de que tu médico te
          ubique en la plataforma sin exponer tu identidad.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      {data.code && qrSvg ? (
        <section aria-labelledby="codigo-titulo" className="card grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={svgDataUrl(qrSvg)}
            alt={`Código QR del código de paciente ${data.code}`}
            className="mx-auto h-56 w-56 rounded-lg border border-ink-200 bg-white p-1"
          />
          <div className="space-y-4">
            <div>
              <h2 id="codigo-titulo" className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                Tu código
              </h2>
              <p className="mt-1 select-all font-mono text-2xl font-semibold tracking-[0.2em] text-ink-950 sm:text-3xl">
                {data.code}
              </p>
              {data.createdAt && (
                <p className="mt-1 text-xs text-ink-400">Generado el {new Date(data.createdAt).toLocaleDateString('es-VE')}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={copy}>
                Copiar código
              </Button>
              <Button variant="outline" loading={busy === 'download'} onClick={downloadPng}>
                Descargar QR
              </Button>
              <Button variant="ghost" onClick={() => setConfirmRotate(true)}>
                Generar uno nuevo
              </Button>
            </div>
            <p className="text-xs text-ink-500">
              Compártelo solo con tu médico, nunca en redes sociales. Si crees que alguien más lo tiene, genera uno nuevo:
              el anterior deja de funcionar al instante.
            </p>
          </div>
        </section>
      ) : (
        <section className="card space-y-4 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Aún no tienes un código</h2>
          <p className="text-sm text-ink-600">
            Genera tu código y su QR cuando vayas a consultar a un médico. Es aleatorio y solo sirve para que un médico te
            registre como su paciente.
          </p>
          <Button loading={busy === 'generate'} onClick={generate}>
            Generar mi código
          </Button>
        </section>
      )}

      <section aria-labelledby="alcance-titulo" className="card space-y-4 p-6">
        <div>
          <h2 id="alcance-titulo" className="text-lg font-semibold text-ink-900">
            Qué verá el médico que te registre
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Entregar tu código es tu autorización: el médico que lo registre podrá ver lo que marques aquí durante un año.
            Puedes retirarle el acceso cuando quieras desde{' '}
            <Link href="/paciente/permisos" className="font-medium text-pine-700 underline">
              Permisos
            </Link>
            .
          </p>
        </div>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">Datos que verá el médico</legend>
          {ALL_SCOPES.map((scope) => {
            const checked = scopes.includes(scope);
            return (
              <label
                key={scope}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-lg border p-4 text-sm transition-colors',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-pine-600 has-[:focus-visible]:ring-offset-2',
                  checked ? 'border-pine-700 bg-pine-50' : 'border-ink-300 bg-white hover:border-ink-400',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setScopes((prev) => (checked ? prev.filter((s) => s !== scope) : [...prev, scope]))}
                  className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pine-700 focus:ring-pine-600"
                />
                <span>
                  <span className="block font-medium text-ink-900">{SCOPE_INFO[scope].label}</span>
                  <span className="block text-ink-500">{SCOPE_INFO[scope].description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {scopes.length === 0 && <p className="text-sm text-red-700">Elige al menos un dato.</p>}
        <div className="flex justify-end">
          <Button loading={busy === 'scopes'} disabled={!scopesChanged || scopes.length === 0} onClick={saveScopes}>
            Guardar
          </Button>
        </div>
      </section>

      <section aria-labelledby="como-titulo" className="space-y-3">
        <h2 id="como-titulo" className="text-lg font-semibold text-ink-900">
          Cómo funciona
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step} className="card p-4 text-sm text-ink-600">
              <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-pine-700 text-xs font-semibold text-white">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <Modal open={confirmRotate} onClose={() => setConfirmRotate(false)} title="¿Generar un código nuevo?">
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            Tu código actual dejará de funcionar al instante. Los médicos que ya te registraron conservan su acceso; si
            quieres retirárselo, hazlo desde Permisos.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmRotate(false)}>
              Cancelar
            </Button>
            <Button loading={busy === 'generate'} onClick={generate}>
              Generar código nuevo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
