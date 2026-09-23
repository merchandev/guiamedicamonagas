'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';

type Status = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

interface Appointment {
  id: string;
  startsAt: string;
  status: Status;
  reason: string | null;
  professional: { firstName: string; lastName: string; slug: string };
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
                    {new Date(a.startsAt).toLocaleString('es-VE', {
                      dateStyle: 'full',
                      timeStyle: 'short',
                      timeZone: 'America/Caracas',
                    })}
                  </p>
                  {a.location && <p className="text-xs text-ink-400">{a.location.name} · {a.location.address}</p>}
                  {a.reason && <p className="mt-1 text-xs text-ink-500">Motivo: {a.reason}</p>}
                </div>
                {upcoming && (
                  <Button variant="outline" size="sm" loading={cancellingId === a.id} onClick={() => cancel(a.id)}>
                    Cancelar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
