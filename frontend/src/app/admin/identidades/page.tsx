'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

type IdentityStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

interface QueueItem {
  id: string;
  patientCode: string;
  firstName: string | null;
  lastName: string | null;
  identityStatus: IdentityStatus;
  identityReviewNote: string | null;
  identityReviewedAt: string | null;
  updatedAt: string;
}

interface IdentityCase {
  id: string;
  patientCode: string;
  firstName: string | null;
  lastName: string | null;
  cedula: string | null;
  identityStatus: IdentityStatus;
  identityReviewNote: string | null;
  createdAt: string;
  idPhotoUrl: string | null;
}

const TABS: { status: IdentityStatus; label: string }[] = [
  { status: 'PENDING', label: 'Pendientes' },
  { status: 'VERIFIED', label: 'Verificadas' },
  { status: 'REJECTED', label: 'Rechazadas' },
];

const STATUS_BADGE: Record<IdentityStatus, { label: string; tone: 'amber' | 'pine' | 'red' }> = {
  PENDING: { label: 'Pendiente', tone: 'amber' },
  VERIFIED: { label: 'Verificada', tone: 'pine' },
  REJECTED: { label: 'Rechazada', tone: 'red' },
};

export default function IdentityQueuePage() {
  const [status, setStatus] = useState<IdentityStatus>('PENDING');
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [current, setCurrent] = useState<IdentityCase | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (s: IdentityStatus) => {
    setItems(null);
    const res = await api.get<{ items: QueueItem[] }>(`/patients/admin/identity?status=${s}`);
    setItems(res.items);
  }, []);

  useEffect(() => {
    void load(status);
  }, [status, load]);

  // Abrir un caso descifra la cédula y firma la foto por 5 minutos; el
  // backend lo deja en la auditoría.
  const openCase = async (id: string) => {
    setError(null);
    setNote('');
    try {
      setCurrent(await api.get<IdentityCase>(`/patients/admin/identity/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo abrir el caso');
    }
  };

  const submitReview = async (approved: boolean) => {
    if (!current) return;
    if (!approved && !note.trim()) {
      setError('Indica el motivo del rechazo: el paciente lo recibe para corregirlo');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/patients/admin/identity/${current.id}/review`, { approved, note: note.trim() || undefined });
      setCurrent(null);
      await load(status);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la revisión');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Identidad de pacientes</h1>
        <p className="mt-1 text-sm text-ink-600">
          Compara la foto del documento con el nombre y la cédula registrados. Cada caso que abres queda en la
          auditoría; al rechazar, la foto se elimina y el paciente recibe el motivo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            onClick={() => setStatus(tab.status)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              status === tab.status ? 'bg-pine-700 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && !current && <Alert tone="error">{error}</Alert>}

      {!items ? (
        <PageSpinner />
      ) : items.length === 0 ? (
        <EmptyState
          title={status === 'PENDING' ? 'No hay identidades pendientes' : 'Sin registros'}
          description={status === 'PENDING' ? 'Todo está al día.' : 'No hay pacientes en este estado.'}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const badge = STATUS_BADGE[item.identityStatus];
            return (
              <div key={item.id} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-ink-900">
                    {item.firstName} {item.lastName}
                    <Badge tone="neutral" className="ml-2">
                      {item.patientCode}
                    </Badge>
                  </p>
                  <p className="text-xs text-ink-400">
                    {item.identityReviewedAt
                      ? `Revisada el ${new Date(item.identityReviewedAt).toLocaleDateString('es-VE')}`
                      : `Actualizada el ${new Date(item.updatedAt).toLocaleDateString('es-VE')}`}
                  </p>
                  {item.identityReviewNote && <p className="text-sm text-ink-600">Nota: {item.identityReviewNote}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                  {item.identityStatus !== 'REJECTED' && (
                    <Button size="sm" onClick={() => openCase(item.id)}>
                      {item.identityStatus === 'PENDING' ? 'Revisar' : 'Ver'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!current} onClose={() => setCurrent(null)} title="Verificar identidad" widthClassName="max-w-2xl">
        {current && (
          <div className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-ink-500">Nombre registrado</dt>
                <dd className="font-medium text-ink-900">
                  {current.firstName} {current.lastName}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Cédula registrada</dt>
                <dd className="font-medium text-ink-900">{current.cedula ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Código</dt>
                <dd className="font-medium text-ink-900">{current.patientCode}</dd>
              </div>
            </dl>
            {current.idPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.idPhotoUrl}
                alt="Documento de identidad del paciente"
                className="max-h-[50vh] w-full rounded-lg border border-ink-200 bg-ink-50 object-contain"
              />
            ) : (
              <Alert tone="warning">El paciente no tiene una foto de identificación cargada.</Alert>
            )}
            {current.idPhotoUrl && (
              <>
                <Textarea
                  label="Nota (obligatoria si rechazas)"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej. La foto está borrosa o el número no coincide con la cédula registrada"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="danger" loading={submitting} onClick={() => submitReview(false)}>
                    Rechazar y eliminar foto
                  </Button>
                  {current.identityStatus !== 'VERIFIED' && (
                    <Button loading={submitting} onClick={() => submitReview(true)}>
                      Verificar
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
