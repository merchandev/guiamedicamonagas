'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea, Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '@/lib/labels';
import { DocumentType } from '@/lib/types';

interface QueueItem {
  id: string;
  type: DocumentType;
  status: string;
  originalFileName: string;
  createdAt: string;
  professional: { firstName: string; lastName: string; slug: string; isSpecialist: boolean };
}

// Tipos con vigencia periódica: hoy ninguno (debe coincidir con EXPIRING_DOCUMENT_TYPES del backend).
const EXPIRING_TYPES: DocumentType[] = [];

export default function VerificationsQueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [reviewing, setReviewing] = useState<QueueItem | null>(null);
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () =>
    api.get<{ items: QueueItem[] }>('/documents/admin/queue?status=PENDING&limit=50').then((res) => setItems(res.items));

  useEffect(() => {
    load();
  }, []);

  const openDocument = async (id: string) => {
    const { url } = await api.get<{ url: string }>(`/documents/admin/${id}/download`);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const submitReview = async (approved: boolean) => {
    if (!reviewing) return;
    if (!approved && !note.trim()) {
      setError('Debes indicar un motivo de rechazo');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/documents/admin/${reviewing.id}/review`, {
        approved,
        note: note || undefined,
        expiresAt: expiresAt || undefined,
      });
      setReviewing(null);
      setNote('');
      setExpiresAt('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo revisar el documento');
    } finally {
      setSubmitting(false);
    }
  };

  if (!items) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Cola de verificación de documentos</h1>

      {items.length === 0 ? (
        <EmptyState title="No hay documentos pendientes" description="Todo está al día." />
      ) : (
        <div className="space-y-3">
          {items.map((doc) => {
            const status = DOCUMENT_STATUS_LABELS[doc.status];
            return (
              <div key={doc.id} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-ink-900">
                    Dr(a). {doc.professional.firstName} {doc.professional.lastName}
                    {doc.professional.isSpecialist && <Badge tone="gold" className="ml-2">Especialista</Badge>}
                  </p>
                  <p className="text-sm text-ink-600">{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</p>
                  <p className="text-xs text-ink-400">
                    {doc.originalFileName} · {new Date(doc.createdAt).toLocaleDateString('es-VE')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {status && <Badge tone={status.tone}>{status.label}</Badge>}
                  <Button variant="outline" size="sm" onClick={() => openDocument(doc.id)}>
                    Ver documento
                  </Button>
                  <Button size="sm" onClick={() => setReviewing(doc)}>
                    Revisar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!reviewing} onClose={() => setReviewing(null)} title="Revisar documento">
        {reviewing && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              {DOCUMENT_TYPE_LABELS[reviewing.type]} — Dr(a). {reviewing.professional.firstName}{' '}
              {reviewing.professional.lastName}
            </p>
            {error && <Alert tone="error">{error}</Alert>}
            {EXPIRING_TYPES.includes(reviewing.type) && (
              <Input
                label="Fecha de vigencia (obligatoria si apruebas)"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            )}
            <Textarea
              label="Nota (obligatoria si rechazas)"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. La foto del documento está borrosa, vuelve a subirla"
            />
            <div className="flex justify-end gap-2">
              <Button variant="danger" loading={submitting} onClick={() => submitReview(false)}>
                Rechazar
              </Button>
              <Button loading={submitting} onClick={() => submitReview(true)}>
                Aprobar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
