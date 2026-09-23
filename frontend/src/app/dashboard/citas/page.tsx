'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';

type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

interface AgendaAppointment {
  id: string;
  startsAt: string;
  status: AppointmentStatus;
  reason: string | null;
  patient: { patientCode: string };
  location: { name: string } | null;
}

const STATUS_LABELS: Record<AppointmentStatus, { label: string; tone: 'neutral' | 'pine' | 'gold' | 'red' | 'amber' }> = {
  PENDING: { label: 'Pendiente de confirmar', tone: 'amber' },
  CONFIRMED: { label: 'Confirmada', tone: 'pine' },
  COMPLETED: { label: 'Completada', tone: 'neutral' },
  CANCELLED: { label: 'Cancelada', tone: 'red' },
  NO_SHOW: { label: 'No asistió', tone: 'red' },
};

export default function CitasPage() {
  const [appointments, setAppointments] = useState<AgendaAppointment[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [newStartsAt, setNewStartsAt] = useState('');

  const load = () =>
    api
      .get<AgendaAppointment[]>('/appointments/me/agenda')
      .then(setAppointments)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setLocked(true);
      });

  useEffect(() => {
    load();
  }, []);

  const DOCTOR_ONLY_ACTIONS = new Set(['confirm', 'complete', 'no-show']);

  const act = async (id: string, action: string, body?: unknown) => {
    setError(null);
    setBusyId(id);
    try {
      const path = DOCTOR_ONLY_ACTIONS.has(action) ? `/appointments/me/${id}/${action}` : `/appointments/${id}/${action}`;
      await api.patch(path, body);
      await load();
      setReschedulingId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo actualizar la cita');
    } finally {
      setBusyId(null);
    }
  };

  if (locked) {
    return (
      <EmptyState
        title="Citas es un beneficio desde el plan Profesional"
        description="Actualiza tu plan para recibir y gestionar citas de pacientes."
        action={
          <Link href="/dashboard/pagos">
            <Button>Ver planes</Button>
          </Link>
        }
      />
    );
  }

  if (!appointments) return <PageSpinner />;

  const grouped = appointments.reduce<Record<string, AgendaAppointment[]>>((acc, appt) => {
    const day = new Date(appt.startsAt).toLocaleDateString('es-VE', { dateStyle: 'full' });
    (acc[day] ??= []).push(appt);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Citas</h1>
      {error && <Alert tone="error">{error}</Alert>}

      {appointments.length === 0 ? (
        <EmptyState title="Todavía no tienes citas" description="Cuando un paciente reserve, aparecerá aquí." />
      ) : (
        Object.entries(grouped).map(([day, dayAppointments]) => (
          <div key={day} className="card p-5">
            <h2 className="mb-3 text-sm font-semibold capitalize text-ink-900">{day}</h2>
            <ul className="space-y-3">
              {dayAppointments.map((appt) => (
                <li key={appt.id} className="rounded-lg border border-ink-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {new Date(appt.startsAt).toLocaleTimeString('es-VE', { timeStyle: 'short' })} ·{' '}
                        {appt.patient.patientCode}
                      </p>
                      {appt.location && <p className="text-xs text-ink-500">{appt.location.name}</p>}
                      {appt.reason && <p className="mt-1 text-sm text-ink-600">{appt.reason}</p>}
                    </div>
                    <Badge tone={STATUS_LABELS[appt.status].tone}>{STATUS_LABELS[appt.status].label}</Badge>
                  </div>

                  {reschedulingId === appt.id ? (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <Input
                        label="Nueva fecha y hora"
                        type="datetime-local"
                        value={newStartsAt}
                        onChange={(e) => setNewStartsAt(e.target.value)}
                      />
                      <Button
                        size="sm"
                        loading={busyId === appt.id}
                        onClick={() => act(appt.id, 'reschedule', { startsAt: new Date(newStartsAt).toISOString() })}
                      >
                        Guardar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setReschedulingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {appt.status === 'PENDING' && (
                        <Button size="sm" loading={busyId === appt.id} onClick={() => act(appt.id, 'confirm')}>
                          Confirmar
                        </Button>
                      )}
                      {appt.status === 'CONFIRMED' && (
                        <>
                          <Button size="sm" loading={busyId === appt.id} onClick={() => act(appt.id, 'complete')}>
                            Completar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            loading={busyId === appt.id}
                            onClick={() => act(appt.id, 'no-show')}
                          >
                            No asistió
                          </Button>
                        </>
                      )}
                      {(appt.status === 'PENDING' || appt.status === 'CONFIRMED') && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReschedulingId(appt.id);
                              setNewStartsAt('');
                            }}
                          >
                            Reprogramar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={busyId === appt.id}
                            onClick={() => act(appt.id, 'cancel')}
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
