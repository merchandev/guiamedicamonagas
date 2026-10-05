'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { SlotPicker } from '@/components/agenda/SlotPicker';
import { formatDateTime } from '@/lib/dates';
import { useReviewsEnabled } from '@/lib/use-reviews';

type Status = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

interface Appointment {
  id: string;
  startsAt: string;
  status: Status;
  reason: string | null;
  professional: { id: string; firstName: string; lastName: string; slug: string };
  location: { name: string; address: string } | null;
}

const STATUS: Record<Status, { label: string; tone: 'amber' | 'pine' | 'neutral' | 'red' }> = {
  PENDING: { label: 'Pendiente de confirmación', tone: 'amber' },
  CONFIRMED: { label: 'Confirmada', tone: 'pine' },
  COMPLETED: { label: 'Realizada', tone: 'neutral' },
  CANCELLED: { label: 'Cancelada', tone: 'red' },
  NO_SHOW: { label: 'No asistida', tone: 'neutral' },
};

export default function PatientAppointmentsPage() {
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reviewsEnabled = useReviewsEnabled();

  const load = useCallback(() => {
    api
      .get<Appointment[]>('/appointments/me')
      .then(setItems)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus citas');
        setItems([]);
      });
  }, []);

  useEffect(load, [load]);

  const cancel = async (id: string) => {
    if (!window.confirm('¿Cancelar esta cita?')) return;
    setCancellingId(id);
    setError(null);
    try {
      await api.patch(`/appointments/${id}/cancel`, {});
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cancelar la cita');
    } finally {
      setCancellingId(null);
    }
  };

  if (!items) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Mis citas</h1>
        <Link href="/medicos">
          <Button variant="outline" size="sm">
            Buscar médico
          </Button>
        </Link>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {items.length === 0 ? (
        <EmptyState title="Todavía no tienes citas" description="Busca un médico verificado y agenda desde su perfil." />
      ) : (
        <div className="card divide-y divide-ink-50">
          {items.map((a) => {
            const upcoming = new Date(a.startsAt) > new Date() && (a.status === 'PENDING' || a.status === 'CONFIRMED');
            return (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/medicos/${a.professional.slug}`} className="font-semibold text-ink-900 hover:underline">
                      Dr(a). {a.professional.firstName} {a.professional.lastName}
                    </Link>
                    <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-600">
                    {formatDateTime(a.startsAt, { dateStyle: 'full', timeStyle: 'short' })}
                  </p>
                  {a.location && <p className="text-xs text-ink-500">{a.location.name} · {a.location.address}</p>}
                  {a.reason && <p className="mt-1 text-xs text-ink-500">Motivo: {a.reason}</p>}
                </div>
                {reviewsEnabled && a.status === 'COMPLETED' && (
                  <Link
                    href={`/paciente/valoraciones?medico=${encodeURIComponent(a.professional.slug)}`}
                    className="text-sm font-medium text-pine-700 hover:underline"
                  >
                    Valorar la atención
                  </Link>
                )}
                {upcoming && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRescheduling(a)}>
                      Reprogramar
                    </Button>
                    <Button variant="ghost" size="sm" loading={cancellingId === a.id} onClick={() => cancel(a.id)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rescheduling && (
        <RescheduleDialog
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={() => {
            setRescheduling(null);
            setNotice('Cita reprogramada. Le avisamos al médico.');
            load();
          }}
        />
      )}
    </div>
  );
}

/** Elegir otro día y hora libres del mismo médico. */
function RescheduleDialog({ appointment, onClose, onDone }: { appointment: Appointment; onClose: () => void; onDone: () => void }) {
  const [slot, setSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const professionalId = appointment.professional.id;
  const loadSlots = useCallback(
    (from: string, to: string) => api.get<string[]>(`/appointments/availability?professionalId=${professionalId}&from=${from}&to=${to}`),
    [professionalId],
  );

  const save = async () => {
    if (!slot) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/appointments/${appointment.id}/reschedule`, { startsAt: slot });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo reprogramar la cita');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Reprogramar la cita" widthClassName="max-w-xl">
      <div className="space-y-4">
        <p className="text-sm text-ink-700">
          Con Dr(a). {appointment.professional.firstName} {appointment.professional.lastName}. Hoy está para el{' '}
          {formatDateTime(appointment.startsAt, { dateStyle: 'full', timeStyle: 'short' })}.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <SlotPicker loadSlots={loadSlots} selectedSlot={slot} onSelectSlot={setSlot} />
        <div className="flex gap-2">
          <Button loading={saving} disabled={!slot} onClick={save}>
            Cambiar a este horario
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Volver
          </Button>
        </div>
      </div>
    </Modal>
  );
}
