'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { canManage, useOrganization, type OrgDetail } from '@/components/organization/OrgContext';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';

interface SearchResult {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  municipality: string | null;
}

export default function OrganizationDoctorsPage() {
  const { current: org, setCurrent } = useOrganization();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!org) return null;
  const hasPlan = org.planTier === 'ORGANIZATION';
  const manager = canManage(org.myRole);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setResults(await api.get<SearchResult[]>(`/organizations/me/${org.id}/professionals/search?q=${encodeURIComponent(query)}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo buscar');
    }
  };

  const invite = async (professionalId: string) => {
    setBusy(professionalId);
    setError(null);
    try {
      setCurrent(await api.post<OrgDetail>(`/organizations/me/${org.id}/professionals`, { professionalId }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la invitación');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (professionalId: string) => {
    setBusy(professionalId);
    setError(null);
    try {
      setCurrent(await api.delete<OrgDetail>(`/organizations/me/${org.id}/professionals/${professionalId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar al médico');
    } finally {
      setBusy(null);
    }
  };

  const linkedIds = new Set(org.professionals.map((p) => p.professionalId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Médicos asociados</h1>
        <p className="mt-1 text-sm text-ink-600">
          Invita a médicos verificados que atienden en tu organización. Solo aparecen en tu perfil público cuando aceptan la
          invitación.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {!hasPlan ? (
        <EmptyState
          title="Beneficio del plan de organizaciones"
          description="Con el plan puedes mostrar a los médicos que atienden en tus sedes."
          action={
            <Link href="/organizacion/plan">
              <Button>Ver plan</Button>
            </Link>
          }
        />
      ) : (
        <>
          {manager && (
            <form onSubmit={search} className="card grid gap-3 p-6 sm:grid-cols-[1fr_auto] sm:items-end">
              <Input label="Buscar médico verificado" placeholder="Nombre o apellido" value={query} onChange={(e) => setQuery(e.target.value)} />
              <Button type="submit" disabled={query.trim().length < 2}>
                Buscar
              </Button>
              {results.length > 0 && (
                <div className="divide-y divide-ink-50 sm:col-span-2">
                  {results.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-sm text-ink-900">
                        Dr(a). {r.firstName} {r.lastName}
                        {r.municipality && <span className="text-ink-400"> · {r.municipality}</span>}
                      </span>
                      <Button size="sm" variant="outline" disabled={linkedIds.has(r.id)} loading={busy === r.id} onClick={() => invite(r.id)}>
                        {linkedIds.has(r.id) ? 'Invitado' : 'Invitar'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </form>
          )}

          {org.professionals.length === 0 ? (
            <EmptyState title="Aún no tienes médicos asociados" description="Busca e invita a los médicos de tu equipo." />
          ) : (
            <div className="card divide-y divide-ink-50">
              {org.professionals.map((p) => (
                <div key={p.professionalId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-2">
                    <Link href={`/medicos/${p.professional.slug}`} className="text-ink-900 hover:underline">
                      Dr(a). {p.professional.firstName} {p.professional.lastName}
                    </Link>
                    <Badge tone={p.status === 'ACCEPTED' ? 'pine' : 'amber'}>
                      {p.status === 'ACCEPTED' ? 'Asociado' : 'Invitación pendiente'}
                    </Badge>
                  </div>
                  {manager && (
                    <Button size="sm" variant="outline" loading={busy === p.professionalId} onClick={() => remove(p.professionalId)}>
                      Quitar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
