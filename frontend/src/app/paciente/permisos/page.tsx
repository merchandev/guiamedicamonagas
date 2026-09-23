'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { PATIENT_CONSENT_VERSION } from '@/lib/legal';
import { ALL_SCOPES, SCOPE_INFO, type PatientDataScope } from '@/lib/patient-scopes';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';

type Scope = PatientDataScope;

interface Professional {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
}

interface Grant {
  id: string;
  scopes: Scope[];
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  reason: string | null;
  professional: Professional;
}


const DURATIONS = [
  { value: '1', label: '1 día' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
];

function grantState(grant: Grant): { label: string; tone: 'pine' | 'neutral' | 'red' } {
  if (grant.revokedAt) return { label: 'Revocada', tone: 'red' };
  if (new Date(grant.expiresAt) <= new Date()) return { label: 'Vencida', tone: 'neutral' };
  return { label: 'Vigente', tone: 'pine' };
}

export default function PatientPermissionsPage() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['IDENTITY']);
  const [days, setDays] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([
        api.get<Grant[]>('/patients/me/grants'),
        api.get<Professional[]>('/patients/me/professionals'),
      ]);
      setGrants(g);
      setProfessionals(p);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus permisos');
      setGrants([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleScope = (scope: Scope) =>
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));

  const grant = async () => {
    if (!professionalId || scopes.length === 0) return;
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      await api.post('/patients/me/grants', { professionalId, scopes, durationDays: Number(days) });
      setMessage('Autorización guardada. Puedes revocarla cuando quieras.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la autorización');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    setMessage(null);
    setRevokingId(id);
    try {
      await api.delete(`/patients/me/grants/${id}`);
      setMessage('Autorización revocada: el médico ya no puede ver esos datos.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo revocar la autorización');
    } finally {
      setRevokingId(null);
    }
  };

  if (!grants) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Permisos sobre mis datos</h1>
        <p className="mt-1 text-sm text-ink-600">
          Tú decides qué médico ve qué datos y por cuánto tiempo. Sin autorización, un médico solo ve tu código de paciente.
          Cada vez que un médico consulta tus datos, queda registrado.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <section className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Autorizar a un médico</h2>
        {professionals.length === 0 ? (
          <p className="text-sm text-ink-500">
            Aquí aparecerán los médicos con los que tengas o hayas tenido citas. También puedes autorizar al reservar una
            cita.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Médico"
                value={professionalId}
                onChange={setProfessionalId}
                options={[
                  { value: '', label: 'Selecciona un médico' },
                  ...professionals.map((p) => ({ value: p.id, label: `Dr(a). ${p.firstName} ${p.lastName}` })),
                ]}
              />
              <Select label="Durante" value={days} onChange={setDays} options={DURATIONS} />
            </div>
            <fieldset className="space-y-2">
              <legend className="field-label">Qué puede ver</legend>
              {ALL_SCOPES.map((scope) => (
                <label key={scope} className="flex items-start gap-3 rounded-lg border border-ink-100 p-3">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pine-700 focus:ring-pine-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink-900">{SCOPE_INFO[scope].label}</span>
                    <span className="block text-xs text-ink-500">{SCOPE_INFO[scope].description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-xs text-ink-400">
              Tu cédula nunca se comparte. Consentimiento v{PATIENT_CONSENT_VERSION}. Una nueva autorización al mismo médico
              reemplaza la anterior.
            </p>
            <Button onClick={grant} loading={saving} disabled={!professionalId || scopes.length === 0}>
              Autorizar
            </Button>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink-900">Historial de autorizaciones</h2>
        {grants.length === 0 ? (
          <EmptyState title="No has autorizado a ningún médico" description="Ningún médico puede ver tus datos." />
        ) : (
          <div className="card divide-y divide-ink-50">
            {grants.map((g) => {
              const state = grantState(g);
              return (
                <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-900">
                        Dr(a). {g.professional.firstName} {g.professional.lastName}
                      </p>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-ink-600">{g.scopes.map((s) => SCOPE_INFO[s].label).join(' · ')}</p>
                    <p className="text-xs text-ink-400">
                      Desde {new Date(g.grantedAt).toLocaleDateString('es-VE')} hasta{' '}
                      {new Date(g.revokedAt ?? g.expiresAt).toLocaleDateString('es-VE')}
                    </p>
                  </div>
                  {state.label === 'Vigente' && (
                    <Button variant="outline" size="sm" loading={revokingId === g.id} onClick={() => revoke(g.id)}>
                      Revocar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
