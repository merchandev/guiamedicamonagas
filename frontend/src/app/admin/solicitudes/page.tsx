'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  LEGAL_REQUEST_CATEGORY_LABELS,
  LEGAL_REQUEST_STATUS,
  type LegalRequestCategory,
  type LegalRequestStatus,
} from '@/lib/legal-requests';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

interface LegalRequestItem {
  id: string;
  ticket: string;
  category: LegalRequestCategory;
  status: LegalRequestStatus;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string | null;
  userId: string | null;
  subjectUrl: string | null;
  description: string;
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: { email: string } | null;
  createdAt: string;
}

interface LegalRequestPage {
  items: LegalRequestItem[];
  total: number;
  open: number;
  page: number;
  totalPages: number;
}

const TABS: { status: LegalRequestStatus | ''; label: string }[] = [
  { status: 'OPEN', label: 'Recibidas' },
  { status: 'IN_REVIEW', label: 'En revisión' },
  { status: 'RESOLVED', label: 'Resueltas' },
  { status: 'REJECTED', label: 'No procede' },
  { status: '', label: 'Todas' },
];

const STATUS_OPTIONS = (Object.keys(LEGAL_REQUEST_STATUS) as LegalRequestStatus[]).map((value) => ({
  value,
  label: LEGAL_REQUEST_STATUS[value].label,
}));

const RESOLUTION_MIN = 10;
const formatDate = (iso: string) => new Date(iso).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });

export default function AdminLegalRequestsPage() {
  const [status, setStatus] = useState<LegalRequestStatus | ''>('OPEN');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LegalRequestPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<LegalRequestItem | null>(null);
  const [nextStatus, setNextStatus] = useState<LegalRequestStatus>('IN_REVIEW');
  const [resolution, setResolution] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (s: LegalRequestStatus | '', p: number) => {
    setData(null);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(p) });
      if (s) query.set('status', s);
      setData(await api.get<LegalRequestPage>(`/legal-requests/admin?${query.toString()}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las solicitudes');
      setData({ items: [], total: 0, open: 0, page: 1, totalPages: 0 });
    }
  }, []);

  useEffect(() => {
    void load(status, page);
  }, [status, page, load]);

  const open = (item: LegalRequestItem) => {
    setCurrent(item);
    setNextStatus(item.status === 'OPEN' ? 'IN_REVIEW' : item.status);
    setResolution(item.resolution ?? '');
    setModalError(null);
  };

  const closing = nextStatus === 'RESOLVED' || nextStatus === 'REJECTED';

  const save = async () => {
    if (!current) return;
    if (closing && resolution.trim().length < RESOLUTION_MIN) {
      setModalError(`Escribe la respuesta para el solicitante (mínimo ${RESOLUTION_MIN} caracteres)`);
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await api.patch(`/legal-requests/admin/${current.id}`, { status: nextStatus, resolution: resolution.trim() || undefined });
      setCurrent(null);
      await load(status, page);
    } catch (e) {
      setModalError(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Solicitudes legales</h1>
        <p className="mt-1 text-sm text-ink-600">
          Reclamos, denuncias y solicitudes sobre datos personales que llegan por el canal público. Al resolver o rechazar,
          la respuesta se envía al solicitante y queda como constancia. Cada consulta de esta bandeja queda en la
          auditoría.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => {
              setStatus(tab.status);
              setPage(1);
            }}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              status === tab.status ? 'bg-pine-700 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
            )}
          >
            {tab.label}
          </button>
        ))}
        {data && data.open > 0 && <Badge tone="amber">{data.open} sin cerrar</Badge>}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {!data ? (
        <PageSpinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="No hay solicitudes en este estado" description="Cuando llegue una, aparecerá aquí." />
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => {
            const badge = LEGAL_REQUEST_STATUS[item.status];
            return (
              <article key={item.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold tracking-wider text-ink-950">{item.ticket}</span>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      {item.userId && <Badge tone="neutral">Con cuenta</Badge>}
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink-900">{LEGAL_REQUEST_CATEGORY_LABELS[item.category]}</p>
                    <p className="text-xs text-ink-500">
                      {item.requesterName} · {item.requesterEmail}
                      {item.requesterPhone ? ` · ${item.requesterPhone}` : ''} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => open(item)}>
                    {item.status === 'RESOLVED' || item.status === 'REJECTED' ? 'Ver' : 'Atender'}
                  </Button>
                </div>
                <p className="line-clamp-3 whitespace-pre-line text-sm text-ink-700">{item.description}</p>
              </article>
            );
          })}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm text-ink-600">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span>
                Página {data.page} de {data.totalPages} · {data.total} solicitudes
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal open={!!current} onClose={() => setCurrent(null)} title={current ? `Solicitud ${current.ticket}` : undefined} widthClassName="max-w-2xl">
        {current && (
          <div className="space-y-4">
            {modalError && <Alert tone="error">{modalError}</Alert>}
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="text-ink-500">Tipo</dt>
              <dd className="text-ink-900">{LEGAL_REQUEST_CATEGORY_LABELS[current.category]}</dd>
              <dt className="text-ink-500">Solicitante</dt>
              <dd className="text-ink-900">
                {current.requesterName} · {current.requesterEmail}
                {current.requesterPhone ? ` · ${current.requesterPhone}` : ''}
              </dd>
              <dt className="text-ink-500">Cuenta</dt>
              <dd className="text-ink-900">
                {current.userId ? 'Enviada con sesión iniciada: el correo es el de la cuenta.' : 'Enviada sin sesión: identidad sin comprobar.'}
              </dd>
              <dt className="text-ink-500">Recibida</dt>
              <dd className="text-ink-900">{formatDate(current.createdAt)}</dd>
              {current.subjectUrl && (
                <>
                  <dt className="text-ink-500">Página indicada</dt>
                  <dd className="break-all text-ink-900">{current.subjectUrl}</dd>
                </>
              )}
              {current.resolvedAt && (
                <>
                  <dt className="text-ink-500">Cerrada</dt>
                  <dd className="text-ink-900">
                    {formatDate(current.resolvedAt)}
                    {current.resolvedBy ? ` · ${current.resolvedBy.email}` : ''}
                  </dd>
                </>
              )}
            </dl>
            <div className="rounded-lg border border-ink-100 bg-ink-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Descripción</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink-800">{current.description}</p>
            </div>
            <Select
              label="Estado"
              value={nextStatus}
              onChange={(value) => setNextStatus(value as LegalRequestStatus)}
              options={STATUS_OPTIONS}
            />
            <Textarea
              label={closing ? 'Respuesta para el solicitante (obligatoria)' : 'Respuesta para el solicitante (opcional por ahora)'}
              rows={5}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              maxLength={3000}
              hint="Se envía por correo al cerrar la solicitud y se muestra en la consulta de estado. No incluyas datos de terceros."
            />
            {current.category === 'ACCOUNT_DELETION' && (
              <Alert tone="warning">
                Comprueba que quien lo pide es el titular de la cuenta antes de darla de baja o eliminarla desde la gestión de
                cuentas. Esta pantalla solo registra la respuesta.
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCurrent(null)}>
                Cancelar
              </Button>
              <Button loading={saving} onClick={save}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
