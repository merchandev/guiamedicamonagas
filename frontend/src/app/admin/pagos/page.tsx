'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { PAYMENT_STATUS_LABELS } from '@/lib/labels';

interface QueuePayment {
  id: string;
  amountBs: string;
  senderBankName: string | null;
  senderPhone: string | null;
  referenceNumber: string | null;
  paidAt: string | null;
  status: string;
  createdAt: string;
  installment: {
    subscription: {
      professional: { firstName: string; lastName: string; slug: string };
      plan: { name: string };
    };
  };
}

export default function AdminPaymentsPage() {
  const [items, setItems] = useState<QueuePayment[] | null>(null);
  const [reviewing, setReviewing] = useState<QueuePayment | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () =>
    api.get<{ items: QueuePayment[] }>('/payments/admin/queue?status=PENDING&limit=50').then((res) => setItems(res.items));

  useEffect(() => {
    load();
  }, []);

  const openReceipt = async (id: string) => {
    const { url } = await api.get<{ url: string }>(`/payments/admin/${id}/receipt`);
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
      await api.patch(`/payments/admin/${reviewing.id}/review`, { approved, note: note || undefined });
      setReviewing(null);
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo revisar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  if (!items) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Verificación de pagos móviles</h1>

      {items.length === 0 ? (
        <EmptyState title="No hay pagos pendientes de revisión" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 bg-ink-50/50">
              <tr>
                <th className="p-4 font-medium text-ink-600">Profesional</th>
                <th className="p-4 font-medium text-ink-600">Banco</th>
                <th className="p-4 font-medium text-ink-600">Teléfono</th>
                <th className="p-4 font-medium text-ink-600">Referencia</th>
                <th className="p-4 font-medium text-ink-600">Monto (Bs)</th>
                <th className="p-4 font-medium text-ink-600">Estado</th>
                <th className="p-4 font-medium text-ink-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {items.map((p) => {
                const status = PAYMENT_STATUS_LABELS[p.status];
                return (
                  <tr key={p.id}>
                    <td className="p-4 font-medium text-ink-900">
                      {p.installment.subscription.professional.firstName}{' '}
                      {p.installment.subscription.professional.lastName}
                    </td>
                    <td className="p-4">{p.senderBankName}</td>
                    <td className="p-4">{p.senderPhone}</td>
                    <td className="p-4 font-mono">{p.referenceNumber}</td>
                    <td className="p-4 font-semibold">{p.amountBs}</td>
                    <td className="p-4">{status && <Badge tone={status.tone}>{status.label}</Badge>}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openReceipt(p.id)}>
                          Ver comprobante
                        </Button>
                        <Button size="sm" onClick={() => setReviewing(p)}>
                          Revisar
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!reviewing} onClose={() => setReviewing(null)} title="Revisar pago">
        {reviewing && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              Bs. {reviewing.amountBs} — {reviewing.installment.subscription.professional.firstName}{' '}
              {reviewing.installment.subscription.professional.lastName}
            </p>
            {error && <Alert tone="error">{error}</Alert>}
            <Textarea
              label="Nota (obligatoria si rechazas)"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. El monto no coincide con la referencia"
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
