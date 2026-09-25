'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { ALL_SCOPES, SCOPE_INFO, type PatientDataScope } from '@/lib/patient-scopes';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';

interface PatientListItem {
  patientId: string;
  patientCode: string;
  appointmentCount: number;
  lastVisit: string | null;
  registeredAt: string | null;
  registered: boolean;
  hasAccount: boolean;
  createdByMe: boolean;
  identity: { firstName: string | null; lastName: string | null } | null;
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

const fullName = (identity: PatientListItem['identity']) =>
  identity ? `${identity.firstName ?? ''} ${identity.lastName ?? ''}`.trim() : '';

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
  return (
    <Suspense fallback={<PageSpinner />}>
      <PacientesContent />
    </Suspense>
  );
}

function PacientesContent() {
  const router = useRouter();
  const codeFromQr = useSearchParams().get('codigo') ?? '';
  const [patients, setPatients] = useState<PatientListItem[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, PatientData>>({});
  const [code, setCode] = useState(codeFromQr);
  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState<PatientListItem | null>(null);

  const load = useCallback(
    () =>
      api
        .get<PatientListItem[]>('/appointments/me/patients')
        .then(setPatients)
        .catch((e) => {
          if (e instanceof ApiError && e.status === 403) setLocked(true);
          else setPatients([]);
        }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setRegistering(true);
    try {
      const result = await api.post<{ scopes: PatientDataScope[] }>('/appointments/me/patients/register', { code });
      setNotice(
        `Paciente registrado. Puedes ver: ${result.scopes.map((s) => SCOPE_INFO[s].label.toLowerCase()).join(', ')}. El paciente recibió un aviso.`,
      );
      setCode('');
      // El código no se queda en la barra de direcciones ni en el historial.
      if (codeFromQr) router.replace('/dashboard/pacientes');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo registrar al paciente');
    } finally {
      setRegistering(false);
    }
  };

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

  const remove = async () => {
    if (!removing) return;
    setError(null);
    setNotice(null);
    setBusyId(removing.patientId);
    try {
      await api.delete(`/appointments/me/patients/${removing.patientId}`);
      setData((prev) => {
        const { [removing.patientId]: _removed, ...rest } = prev;
        return rest;
      });
      setNotice('Paciente quitado de tu directorio. Ya no ves sus datos.');
      setRemoving(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo quitar al paciente');
    } finally {
      setBusyId(null);
    }
  };

  if (locked) {
    return (
      <EmptyState
        title="El directorio de pacientes es un beneficio desde el plan Profesional"
        description="Actualiza tu plan para registrar pacientes con su código y ver a los que tienen citas contigo."
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
          Registra a tus pacientes con el código o el QR que te entreguen. Solo ves los datos que cada paciente autoriza,
          durante el tiempo que elija; cada consulta queda registrada. Usa estos datos únicamente para su atención.
        </p>
      </div>

      <form onSubmit={register} aria-labelledby="registrar-titulo" className="card space-y-4 p-6">
        <div>
          <h2 id="registrar-titulo" className="text-lg font-semibold text-ink-900">
            Registrar paciente
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Pídele al paciente su código de 12 caracteres (en su panel, «Mi código») o escanea su QR con la cámara de tu
            teléfono.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input
            id="codigo-paciente"
            label="Código del paciente"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7Q4-M9TX-P3WD"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            className="font-mono tracking-wider"
            required
          />
          <Button type="submit" loading={registering} disabled={code.replace(/[\s-]/g, '').length !== 12}>
            Registrar paciente
          </Button>
        </div>
      </form>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {patients.length === 0 ? (
        <EmptyState
          title="Todavía no tienes pacientes"
          description="Aparecerán aquí cuando los registres con su código o cuando tengan una cita contigo."
        />
      ) : (
        <div className="card divide-y divide-ink-50">
          {patients.map((p) => {
            const shown = data[p.patientId];
            const canRead = p.access.kind !== 'NONE';
            const name = fullName(p.identity);
            return (
              <div key={p.patientId} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-900">{name || p.patientCode}</p>
                      {name && <Badge tone="neutral">{p.patientCode}</Badge>}
                      {p.access.kind === 'GRANT' && (
                        <Badge tone="pine">
                          Autorizado: {p.access.scopes.map((s) => SCOPE_INFO[s].label).join(', ')}
                        </Badge>
                      )}
                      {p.access.kind === 'WALK_IN' && <Badge tone="neutral">Ficha registrada por ti</Badge>}
                      {p.access.kind === 'NONE' && <Badge tone="amber">Sin autorización</Badge>}
                    </div>
                    <p className="text-sm text-ink-500">
                      {[
                        p.registeredAt && `Registrado con su código el ${new Date(p.registeredAt).toLocaleDateString('es-VE')}`,
                        p.appointmentCount > 0 &&
                          `${p.appointmentCount} ${p.appointmentCount === 1 ? 'cita' : 'citas'}${
                            p.lastVisit ? ` · Última: ${new Date(p.lastVisit).toLocaleDateString('es-VE')}` : ''
                          }`,
                        p.access.expiresAt && `Autorización hasta ${new Date(p.access.expiresAt).toLocaleDateString('es-VE')}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canRead
                      ? !shown && (
                          <Button variant="outline" size="sm" loading={busyId === p.patientId} onClick={() => read(p.patientId)}>
                            Ver datos autorizados
                          </Button>
                        )
                      : p.hasAccount && (
                          <Button variant="outline" size="sm" loading={busyId === p.patientId} onClick={() => requestAccess(p.patientId)}>
                            Solicitar acceso
                          </Button>
                        )}
                    {p.registered && (
                      <Button variant="ghost" size="sm" onClick={() => setRemoving(p)}>
                        Quitar
                      </Button>
                    )}
                  </div>
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

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="¿Quitar de tu directorio?">
        {removing && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              Dejarás de ver los datos de {fullName(removing.identity) || removing.patientCode}. Para volver a registrarlo
              necesitarás que el paciente te entregue su código otra vez.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRemoving(null)}>
                Cancelar
              </Button>
              <Button variant="danger" loading={busyId === removing.patientId} onClick={remove}>
                Quitar paciente
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
