'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { PATIENT_AREA_NOTICE } from '@/lib/legal';
import {
  LEGAL_REQUEST_CATEGORY_LABELS,
  LEGAL_REQUEST_STATUS,
  type LegalRequestSummary,
} from '@/lib/legal-requests';
import { SCOPE_INFO, type PatientDataScope } from '@/lib/patient-scopes';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';

interface AccessLogEntry {
  id: string;
  action: string;
  at: string;
  scopes: PatientDataScope[] | null;
  professional: { name: string; slug: string | null } | null;
}

// Cómo se cuenta cada evento al paciente; «who» es el médico cuando el evento lo tiene.
const ACTION_TEXT: Record<string, (who: string) => string> = {
  PATIENT_DATA_READ: (who) => who + ' consultó tus datos',
  PATIENT_DATA_ACCESS_REQUESTED: (who) => who + ' pidió acceso a tus datos',
  PATIENT_REGISTERED_BY_CODE: (who) => who + ' te registró como paciente con tu código',
  PATIENT_REMOVED_FROM_DIRECTORY: (who) => who + ' te quitó de su lista de pacientes',
  PATIENT_DATA_GRANTED: (who) => 'Se autorizó el acceso de ' + who,
  PATIENT_DATA_REVOKED: (who) => 'Se revocó el acceso de ' + who,
  PATIENT_SHARE_CODE_CREATED: () => 'Generaste tu código de paciente',
  PATIENT_SHARE_CODE_ROTATED: () => 'Generaste un código nuevo; el anterior dejó de funcionar',
  PATIENT_IDENTITY_DOCUMENT_VIEWED: () => 'Un administrador abrió tu documento de identidad para verificarlo',
  PATIENT_IDENTITY_VERIFIED: () => 'Un administrador verificó tu identidad',
  PATIENT_IDENTITY_REJECTED: () => 'Un administrador rechazó la foto de tu documento de identidad',
};

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });

export default function PatientPrivacyPage() {
  const [log, setLog] = useState<AccessLogEntry[] | null>(null);
  const [requests, setRequests] = useState<LegalRequestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<AccessLogEntry[]>('/patients/me/access-log'),
      api.get<LegalRequestSummary[]>('/legal-requests/me'),
    ])
      .then(([entries, own]) => {
        setLog(entries);
        setRequests(own);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu información de privacidad');
        setLog([]);
      });
  }, []);

  // La copia se arma en el navegador y se descarga como archivo: no pasa por ningún tercero.
  const download = async () => {
    setDownloading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await api.get<unknown>('/patients/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mis-datos-guia-medica-monagas-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage('Se descargó la copia de tus datos. Contiene información de salud: guárdala en un lugar seguro.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo generar la copia de tus datos');
    } finally {
      setDownloading(false);
    }
  };

  if (!log) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Privacidad y mis datos</h1>
        <p className="mt-1 text-sm text-ink-600">
          Descarga una copia de tu información, revisa quién accedió a ella y ejerce tus derechos.
        </p>
      </div>

      <Alert tone="info" title="Cómo usamos tu información">
        {PATIENT_AREA_NOTICE}{' '}
        <Link href="/privacidad/datos-de-salud" className="font-medium underline">
          Política de datos de salud
        </Link>
        .
      </Alert>

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <section aria-labelledby="copia-titulo" className="card space-y-3 p-6">
        <h2 id="copia-titulo" className="text-lg font-semibold text-ink-900">
          Descargar mis datos
        </h2>
        <p className="text-sm text-ink-600">
          Un archivo con tu cuenta, tu perfil, tu información de salud, tus citas, tus autorizaciones, el historial de
          accesos y los textos legales que aceptaste. La descarga queda registrada.
        </p>
        <Button loading={downloading} onClick={download}>
          Descargar mis datos
        </Button>
      </section>

      <section aria-labelledby="accesos-titulo" className="space-y-3">
        <div>
          <h2 id="accesos-titulo" className="text-lg font-semibold text-ink-900">
            Historial de accesos
          </h2>
          <p className="text-sm text-ink-600">
            Quién consultó tu información, cuándo y con qué alcance. Para retirar un acceso ve a{' '}
            <Link href="/paciente/permisos" className="font-medium text-pine-700 underline">
              Permisos
            </Link>
            .
          </p>
        </div>
        {log.length === 0 ? (
          <p className="card p-5 text-sm text-ink-500">Todavía no hay actividad sobre tus datos.</p>
        ) : (
          <ol className="card divide-y divide-ink-50">
            {log.map((entry) => {
              const who = entry.professional?.name ?? 'un médico';
              const text = (ACTION_TEXT[entry.action] ?? (() => 'Actividad sobre tus datos'))(who);
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4">
                  <div className="text-sm">
                    <p className="text-ink-900">{text.charAt(0).toUpperCase() + text.slice(1)}</p>
                    {entry.scopes && entry.scopes.length > 0 && (
                      <p className="text-xs text-ink-500">
                        Alcance: {entry.scopes.map((scope) => SCOPE_INFO[scope]?.label ?? scope).join(' · ')}
                      </p>
                    )}
                  </div>
                  <time dateTime={entry.at} className="text-xs text-ink-500">
                    {formatDateTime(entry.at)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="derechos-titulo" className="card space-y-4 p-6">
        <div>
          <h2 id="derechos-titulo" className="text-lg font-semibold text-ink-900">
            Solicitudes sobre mis datos
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Lo que no puedas hacer tú mismo desde el panel, pídelo aquí. Cada solicitud tiene un número de seguimiento.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          <li>
            <Link href="/reclamos?tipo=PRIVACY_RIGHTS" className="block h-full rounded-lg border border-ink-200 p-4 text-sm hover:border-pine-300">
              <span className="block font-medium text-pine-800">Corregir o consultar un dato</span>
              <span className="mt-1 block text-ink-500">Acceso, copia o corrección de tu información.</span>
            </Link>
          </li>
          <li>
            <Link href="/reclamos?tipo=UNAUTHORIZED_ACCESS" className="block h-full rounded-lg border border-ink-200 p-4 text-sm hover:border-pine-300">
              <span className="block font-medium text-pine-800">Denunciar un acceso indebido</span>
              <span className="mt-1 block text-ink-500">Si alguien vio tus datos sin tu permiso.</span>
            </Link>
          </li>
          <li>
            <Link href="/reclamos?tipo=ACCOUNT_DELETION" className="block h-full rounded-lg border border-ink-200 p-4 text-sm hover:border-red-300">
              <span className="block font-medium text-red-700">Cerrar mi cuenta</span>
              <span className="mt-1 block text-ink-500">Baja de la cuenta y eliminación de tus datos.</span>
            </Link>
          </li>
        </ul>

        {requests.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Mis solicitudes</h3>
            <ul className="mt-2 divide-y divide-ink-50 rounded-lg border border-ink-100">
              {requests.map((request) => {
                const status = LEGAL_REQUEST_STATUS[request.status];
                return (
                  <li key={request.ticket} className="space-y-1 p-4 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold tracking-wider text-ink-950">{request.ticket}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="text-xs text-ink-500">{new Date(request.createdAt).toLocaleDateString('es-VE')}</span>
                    </p>
                    <p className="text-ink-700">{LEGAL_REQUEST_CATEGORY_LABELS[request.category]}</p>
                    {request.resolution && (
                      <p className="whitespace-pre-line rounded-md bg-ink-50 p-3 text-ink-700">{request.resolution}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <p className="text-xs text-ink-500">
        Todos tus derechos y cómo ejercerlos están en el{' '}
        <Link href="/privacidad/derechos" className="text-pine-700 underline">
          Centro de privacidad
        </Link>
        .
      </p>
    </div>
  );
}
