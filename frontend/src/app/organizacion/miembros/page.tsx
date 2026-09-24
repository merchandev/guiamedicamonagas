'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ORG_MEMBER_ROLE_LABELS } from '@/lib/labels';
import { can, useOrganization, type OrgRole } from '@/components/organization/OrgContext';
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
  userId: string;
  user: { email: string };
}

interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
  invitedBy: { email: string } | null;
}

const ROLE_HELP: Record<OrgRole, string> = {
  OWNER: 'todo, incluido nombre, tipo, RIF y roles',
  ADMIN: 'equipo, médicos asociados y plan',
  EDITOR: 'solo el contenido del perfil',
};

/** Mismas reglas que organization-roles.ts del backend (que es quien decide). */
function canRemove(actor: OrgRole, target: OrgRole) {
  return actor === 'OWNER' || (actor === 'ADMIN' && target === 'EDITOR');
}

export default function OrganizationMembersPage() {
  const { current: org } = useOrganization();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('EDITOR');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);

  const canInvite = can(org, 'INVITE_MEMBERS');
  const canManageRoles = can(org, 'MANAGE_ROLES');

  const load = useCallback(() => {
    if (!org) return;
    api.get<Member[]>(`/organizations/me/${org.id}/members`).then(setMembers).catch(() => setMembers([]));
    if (can(org, 'INVITE_MEMBERS')) {
      api.get<Invitation[]>(`/organizations/me/${org.id}/invitations`).then(setInvitations).catch(() => setInvitations([]));
    }
  }, [org]);

  useEffect(load, [load]);

  useEffect(() => {
    if (org?.invitableRoles?.length && !org.invitableRoles.includes(role)) setRole(org.invitableRoles[0]);
  }, [org, role]);

  if (!org || !members) return <PageSpinner />;

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setInvitations(await api.post<Invitation[]>(`/organizations/me/${org.id}/invitations`, { email, role }));
      setNotice(`Enviamos la invitación a ${email}. Vence en 72 horas.`);
      setEmail('');
    }, 'No se pudo enviar la invitación');
  };

  const revoke = (invitationId: string) =>
    run(async () => {
      setInvitations(await api.delete<Invitation[]>(`/organizations/me/${org.id}/invitations/${invitationId}`));
    }, 'No se pudo revocar la invitación');

  const changeRole = (memberId: string, newRole: OrgRole) =>
    run(async () => {
      setMembers(await api.patch<Member[]>(`/organizations/me/${org.id}/members/${memberId}`, { role: newRole }));
    }, 'No se pudo cambiar el rol');

  const remove = (memberId: string) =>
    run(async () => {
      setMembers(await api.delete<Member[]>(`/organizations/me/${org.id}/members/${memberId}`));
      setConfirmingRemoval(null);
    }, 'No se pudo quitar al miembro');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Equipo</h1>
        <p className="mt-1 text-sm text-ink-600">
          Personas que administran {org.name}. Tu rol: <strong>{ORG_MEMBER_ROLE_LABELS[org.myRole]}</strong> (
          {ROLE_HELP[org.myRole]}).
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="card divide-y divide-ink-50">
        {members.map((m) => {
          const isMe = m.userId === user?.id;
          return (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink-900">{m.user.email}</span>
                {isMe && <span className="text-xs text-ink-400">(tú)</span>}
                {!canManageRoles && (
                  <Badge tone={m.role === 'OWNER' ? 'gold' : 'neutral'}>{ORG_MEMBER_ROLE_LABELS[m.role]}</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManageRoles && (
                  <div className="w-44">
                    <Select
                      label=""
                      value={m.role}
                      disabled={busy}
                      onChange={(value) => void changeRole(m.id, value as OrgRole)}
                      options={(['OWNER', 'ADMIN', 'EDITOR'] as OrgRole[]).map((r) => ({ value: r, label: ORG_MEMBER_ROLE_LABELS[r] }))}
                    />
                  </div>
                )}
                {!isMe && canRemove(org.myRole, m.role) &&
                  (confirmingRemoval === m.id ? (
                    <>
                      <Button variant="danger" size="sm" loading={busy} onClick={() => void remove(m.id)}>
                        Sí, quitar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmingRemoval(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setConfirmingRemoval(m.id)}>
                      Quitar
                    </Button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      {canManageRoles && (
        <p className="text-xs text-ink-500">
          Para transferir la propiedad, asigna el rol de dueño a otra persona; después puedes cambiar el tuyo. La
          organización siempre conserva al menos un dueño.
        </p>
      )}

      {canInvite && (
        <>
          <form onSubmit={invite} className="card space-y-4 p-6">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">Invitar al equipo</h2>
              <p className="mt-1 text-sm text-ink-500">
                La persona recibe un enlace por correo (válido 72 horas, un solo uso). Puede aceptarlo con una cuenta
                existente —de paciente, médico u organización— o crear una nueva; no se crea otra organización.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
              <Input label="Correo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <Select
                label="Rol"
                value={role}
                onChange={(v) => setRole(v as OrgRole)}
                options={org.invitableRoles.map((r) => ({ value: r, label: ORG_MEMBER_ROLE_LABELS[r] }))}
              />
              <Button type="submit" loading={busy}>
                Invitar
              </Button>
            </div>
          </form>

          {invitations.length > 0 && (
            <div className="card divide-y divide-ink-50">
              <p className="p-4 text-sm font-semibold text-ink-900">Invitaciones pendientes</p>
              {invitations.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-ink-900">
                      {inv.email} <Badge tone="neutral">{ORG_MEMBER_ROLE_LABELS[inv.role]}</Badge>
                    </p>
                    <p className="text-xs text-ink-400">
                      Vence el {new Date(inv.expiresAt).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}
                      {inv.invitedBy ? ` · invitó ${inv.invitedBy.email}` : ''}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void revoke(inv.id)}>
                    Revocar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
