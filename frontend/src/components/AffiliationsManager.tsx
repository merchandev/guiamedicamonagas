'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ORGANIZATION_TYPE_LABELS } from '@/lib/labels';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface Affiliation {
  organizationId: string;
  status: 'PENDING' | 'ACCEPTED';
  organization: { id: string; slug: string; name: string; type: 'PHARMACY' | 'LABORATORY' | 'CLINIC' };
}

/** Invitaciones de clínicas/laboratorios para mostrar al médico como asociado. */
export function AffiliationsManager() {
  const [items, setItems] = useState<Affiliation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get<Affiliation[]>('/organizations/affiliations/me').then(setItems).catch(() => setItems([]));
  }, []);

  const respond = async (organizationId: string, accept: boolean) => {
    setBusy(organizationId);
    setError(null);
    try {
      setItems(await api.patch<Affiliation[]>(`/organizations/affiliations/me/${organizationId}`, { accept }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo responder la invitación');
    } finally {
      setBusy(null);
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Organizaciones asociadas</h2>
        <p className="text-sm text-ink-600">
          Clínicas o laboratorios que quieren mostrarte como médico asociado. Solo apareces vinculado si aceptas.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="divide-y divide-ink-50">
        {items.map((a) => (
          <div key={a.organizationId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink-900">{a.organization.name}</span>
              <span className="text-xs text-ink-500">{ORGANIZATION_TYPE_LABELS[a.organization.type]}</span>
              <Badge tone={a.status === 'ACCEPTED' ? 'pine' : 'amber'}>{a.status === 'ACCEPTED' ? 'Asociado' : 'Invitación'}</Badge>
            </div>
            <div className="flex gap-2">
              {a.status === 'PENDING' && (
                <Button size="sm" loading={busy === a.organizationId} onClick={() => respond(a.organizationId, true)}>
                  Aceptar
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={busy === a.organizationId} onClick={() => respond(a.organizationId, false)}>
                {a.status === 'PENDING' ? 'Rechazar' : 'Desvincular'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
