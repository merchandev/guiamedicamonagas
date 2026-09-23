'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ORG_MEMBER_ROLE_LABELS } from '@/lib/labels';
import { canManage, useOrganization, type OrgRole } from '@/components/organization/OrgContext';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';

interface Member {
  id: string;
  role: OrgRole;
  createdAt: string;
  user: { email: string };
}

export default function OrganizationMembersPage() {
  const { current: org } = useOrganization();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EDITOR'>('EDITOR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!org) return;
    api.get<Member[]>(`/organizations/me/${org.id}/members`).then(setMembers).catch(() => setMembers([]));
  }, [org]);

  useEffect(load, [load]);

  if (!org || !members) return <PageSpinner />;
  const manager = canManage(org.myRole);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMembers(await api.post<Member[]>(`/organizations/me/${org.id}/members`, { email, role }));
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo agregar al miembro');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memberId: string) => {
    if (!window.confirm('¿Quitar a esta persona del equipo?')) return;
    setError(null);
    try {
      setMembers(await api.delete<Member[]>(`/organizations/me/${org.id}/members/${memberId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar al miembro');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Equipo</h1>
        <p className="mt-1 text-sm text-ink-600">
          Personas que administran {org.name}. El dueño y los administradores gestionan plan y equipo; los editores solo
          actualizan el perfil.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="card divide-y divide-ink-50">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2">
              <span className="text-ink-900">{m.user.email}</span>
              <Badge tone={m.role === 'OWNER' ? 'gold' : 'neutral'}>{ORG_MEMBER_ROLE_LABELS[m.role]}</Badge>
            </div>
            {org.myRole === 'OWNER' && m.role !== 'OWNER' && (
              <Button variant="outline" size="sm" onClick={() => remove(m.id)}>
                Quitar
              </Button>
            )}
          </div>
        ))}
      </div>

      {manager && (
        <form onSubmit={add} className="card space-y-4 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Agregar al equipo</h2>
          <p className="text-sm text-ink-500">
            La persona debe haber creado antes una cuenta de tipo «Farmacia, laboratorio o clínica» con ese correo.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <Input label="Correo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select
              label="Rol"
              value={role}
              onChange={(v) => setRole(v as 'ADMIN' | 'EDITOR')}
              options={[
                { value: 'EDITOR', label: 'Editor' },
                { value: 'ADMIN', label: 'Administrador' },
              ]}
            />
            <Button type="submit" loading={busy}>
              Agregar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
