'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ALL_SCOPES, SCOPE_INFO, type PatientDataScope } from '@/lib/patient-scopes';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';

interface PatientListItem {
  patientId: string;
  patientCode: string;
  appointmentCount: number;
  lastVisit: string;
  hasAccount: boolean;
  createdByMe: boolean;
  access: { kind: 'NONE' | 'GRANT' | 'WALK_IN'; scopes: PatientDataScope[]; expiresAt: string | null };
}

interface PatientData {
  patientCode: string;
  scopes: PatientDataScope[];
  expiresAt: string | null;
  identity: { firstName: string | null; lastName: string | null; identityVerified?: boolean } | null;
  contact: { phone: string | null; emergencyMedicalPhone: string | null; emergencyAddress: string | null } | null;
  health: {
    birthDate: string | null;
    sex: string | null;
    bloodType: string | null;
    allergies: string | null;
    isHealthy: boolean;
    conditionSummary: string | null;
    medications: { name: string; schedule: string }[];
    treatingDoctors: string[];
  } | null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <p className="text-sm">
      <span className="text-ink-500">{label}: </span>
      <span className="text-ink-900">{value}</span>
    </p>
  );
}

export default function PacientesPage() {
  const [patients, setPatients] = useState<PatientListItem[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, PatientData>>({});

  useEffect(() => {
    api
      .get<PatientListItem[]>('/appointments/me/patients')
      .then(setPatients)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setLocked(true);
        else setPatients([]);
      });
  }, []);

  const read = async (patientId: string) => {
    setError(null);
    setNotice(null);
    setBusyId(patientId);
    try {
      const result = await api.post<PatientData>(`/appointments/me/patients/${patientId}/data`);
      setData((prev) => ({ ...prev, [patientId]: result }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron ver los datos');
    } finally {
      setBusyId(null);
    }
  };

  const requestAccess = async (patientId: string) => {
    setError(null);
    setNotice(null);
    setBusyId(patientId);
    try {
      await api.post(`/appointments/me/patients/${patientId}/access-request`, { scopes: ALL_SCOPES });
      setNotice('Solicitud enviada. El paciente decide qué compartir y por cuánto tiempo.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar la solicitud');
    } finally {
      setBusyId(null);
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
          Tus pacientes se identifican por código. Solo puedes ver los datos que cada paciente te autorice, durante el tiempo
          que elija; cada consulta queda registrada. Usa estos datos únicamente para su atención.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {patients.length === 0 ? (
        <EmptyState title="Todavía no tienes pacientes" description="Aparecerán aquí en cuanto tengan una cita contigo." />
      ) : (
        <div className="card divide-y divide-ink-50">
          {patients.map((p) => {
            const shown = data[p.patientId];
            const canRead = p.access.kind !== 'NONE';
            return (
              <div key={p.patientId} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-900">{p.patientCode}</p>
                      {p.access.kind === 'GRANT' && (
                        <Badge tone="pine">
                          Autorizado: {p.access.scopes.map((s) => SCOPE_INFO[s].label).join(', ')}
                        </Badge>
                      )}
                      {p.access.kind === 'WALK_IN' && <Badge tone="neutral">Ficha registrada por ti</Badge>}
                      {p.access.kind === 'NONE' && <Badge tone="amber">Sin autorización</Badge>}
                    </div>
                    <p className="text-sm text-ink-500">
                      {p.appointmentCount} {p.appointmentCount === 1 ? 'cita' : 'citas'} · Última visita:{' '}
                      {new Date(p.lastVisit).toLocaleDateString('es-VE')}
                      {p.access.expiresAt && ` · Autorización hasta ${new Date(p.access.expiresAt).toLocaleDateString('es-VE')}`}
                    </p>
                  </div>
                  {canRead ? (
                    !shown && (
                      <Button variant="outline" size="sm" loading={busyId === p.patientId} onClick={() => read(p.patientId)}>
                        Ver datos autorizados
                      </Button>
                    )
                  ) : p.hasAccount ? (
                    <Button variant="outline" size="sm" loading={busyId === p.patientId} onClick={() => requestAccess(p.patientId)}>
                      Solicitar acceso
                    </Button>
                  ) : null}
                </div>

                {shown && (
                  <div className="grid gap-3 rounded-lg bg-ink-50/60 p-4 sm:grid-cols-3">
                    {shown.identity && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Identidad</p>
                        <Field label="Nombre" value={`${shown.identity.firstName ?? ''} ${shown.identity.lastName ?? ''}`.trim()} />
                        {shown.identity.identityVerified && (
                          <p className="mt-1 text-xs font-medium text-pine-700">✓ Identidad verificada por Guía Médica Monagas</p>
                        )}
                      </div>
                    )}
                    {shown.contact && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Contacto</p>
                        <Field label="Teléfono" value={shown.contact.phone} />
                        <Field label="Emergencia" value={shown.contact.emergencyMedicalPhone} />
                        <Field label="Dirección de emergencia" value={shown.contact.emergencyAddress} />
                      </div>
                    )}
                    {shown.health && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Salud</p>
                        <Field label="Nacimiento" value={shown.health.birthDate} />
                        <Field label="Sexo" value={shown.health.sex} />
                        <Field label="Grupo sanguíneo" value={shown.health.bloodType} />
                        <Field label="Alergias" value={shown.health.allergies} />
                        <Field
                          label="Condición"
                          value={shown.health.isHealthy ? 'Persona sana' : shown.health.conditionSummary}
                        />
                        <Field
                          label="Medicamentos"
                          value={shown.health.medications.map((m) => `${m.name} (${m.schedule})`).join(', ')}
                        />
                        <Field label="Médicos tratantes" value={shown.health.treatingDoctors.join(', ')} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
