'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';

interface PatientListItem {
  patientId: string;
  patientCode: string;
  appointmentCount: number;
  lastVisit: string;
}

interface RevealedIdentity {
  patientCode: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export default function PacientesPage() {
  const [patients, setPatients] = useState<PatientListItem[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, RevealedIdentity>>({});

  useEffect(() => {
    api
      .get<PatientListItem[]>('/appointments/me/patients')
      .then(setPatients)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setLocked(true);
      });
  }, []);

  const reveal = async (patientId: string) => {
    setError(null);
    setRevealingId(patientId);
    try {
      const identity = await api.post<RevealedIdentity>(`/appointments/me/patients/${patientId}/reveal`);
      setRevealed((prev) => ({ ...prev, [patientId]: identity }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo revelar la identidad');
    } finally {
      setRevealingId(null);
    }
  };

  if (locked) {
    return (
      <EmptyState
        title="La lista de pacientes es un beneficio desde el plan Profesional"
        description="Actualiza tu plan para ver tus pacientes con citas contigo."
        action={
          <Link href="/dashboard/pagos">
            <Button>Ver planes</Button>
          </Link>
        }
      />
    );
  }

  if (!patients) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Pacientes</h1>
        <p className="mt-1 text-sm text-ink-600">
          Por seguridad, tus pacientes solo se identifican por código. Revela la identidad únicamente cuando lo
          necesites — la acción queda registrada.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {patients.length === 0 ? (
        <EmptyState title="Todavía no tienes pacientes" description="Aparecerán aquí en cuanto tengan una cita contigo." />
      ) : (
        <div className="card divide-y divide-ink-50">
          {patients.map((p) => {
            const identity = revealed[p.patientId];
            return (
              <div key={p.patientId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-ink-900">{p.patientCode}</p>
                  <p className="text-sm text-ink-500">
                    {p.appointmentCount} {p.appointmentCount === 1 ? 'cita' : 'citas'} · Última visita:{' '}
                    {new Date(p.lastVisit).toLocaleDateString('es-VE')}
                  </p>
                  {identity && (
                    <p className="mt-1 text-sm text-pine-700">
                      {identity.firstName} {identity.lastName}
                      {identity.phone ? ` · ${identity.phone}` : ''}
                    </p>
                  )}
                </div>
                {!identity && (
                  <Button variant="outline" size="sm" loading={revealingId === p.patientId} onClick={() => reveal(p.patientId)}>
                    Revelar identidad
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
