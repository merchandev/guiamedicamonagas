'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';
import { AccountActionDialog, type AccountRequest } from '@/components/admin/AccountActionDialog';
import { VERIFICATION_LABELS } from '@/lib/labels';

interface AdminProfessional {
  id: string;
  firstName: string;
  lastName: string;
  slug: string;
  verificationStatus: string;
  isPublished: boolean;
  user: { id: string; email: string; isEmailVerified: boolean; isActive: boolean; deletedAt: string | null };
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo completar la operación. Intenta de nuevo.');

export default function AdminDoctorsPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes('MANAGE_ACCOUNTS');
  const canPurge = user?.permissions.includes('PURGE_ACCOUNTS');
  const [items, setItems] = useState<AdminProfessional[] | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [request, setRequest] = useState<AccountRequest | null>(null);

  const load = useCallback(
    () =>
      api
        .get<{ items: AdminProfessional[] }>(`/professionals/admin/list?limit=50${status ? `&status=${status}` : ''}`)
        .then((res) => setItems(res.items))
        .catch((e) => {
          setItems([]);
          setError(errorText(e));
        }),
    [status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Solo el perfil: la cuenta sigue activa y el médico puede iniciar sesión.
  const toggleSuspend = async (professional: AdminProfessional) => {
    const suspended = professional.verificationStatus !== 'SUSPENDED';
    const note = suspended ? window.prompt('Motivo de la suspensión:') : undefined;
    if (suspended && !note) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/professionals/admin/${professional.id}/suspend`, { suspended, note });
      setSuccess(`Perfil de ${professional.firstName} ${professional.lastName} ${suspended ? 'suspendido' : 'reactivado'}.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const openAccountAction = (p: AdminProfessional, action: AccountRequest['action']) => {
    setError(null);
    setSuccess(null);
    setRequest({ account: { id: p.user.id, name: `${p.firstName} ${p.lastName}`, email: p.user.email }, action });
  };

  if (!items) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Médicos registrados</h1>
        <Select
          value={status}
          onChange={setStatus}
          className="w-56"
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'PENDING', label: 'Pendiente' },
            { value: 'IN_REVIEW', label: 'En revisión' },
            { value: 'VERIFIED', label: 'Verificado' },
            { value: 'REJECTED', label: 'Rechazado' },
            { value: 'SUSPENDED', label: 'Suspendido' },
          ]}
        />
      </div>

      <Link href="/admin/cuentas-medicos" className="inline-block text-pine-700 underline">Gestionar cuentas, bajas y planes pagados</Link>

      {error && !request && <Alert tone="error">{error}</Alert>}
      {success && <div role="status"><Alert tone="success">{success}</Alert></div>}

      <div className="card divide-y divide-ink-50">
        {items.length === 0 && <p className="p-5 text-sm text-ink-600">No hay médicos con ese estado.</p>}
        {items.map((p) => {
          const s = VERIFICATION_LABELS[p.verificationStatus];
          const accountOff = !p.user.isActive;
          return (
            <div key={p.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-ink-900">
                  Dr(a). {p.firstName} {p.lastName}
                </p>
                <p className="text-sm text-ink-500">{p.user.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {accountOff ? (
                  <Badge tone="red">{p.user.deletedAt ? 'Cuenta dada de baja' : 'Cuenta suspendida'}</Badge>
                ) : (
                  s && <Badge tone={s.tone}>{s.label}</Badge>
                )}
                {p.isPublished && (
                  <Link href={`/medicos/${p.slug}`} target="_blank" className="text-sm text-pine-700 hover:underline">
                    Ver perfil
                  </Link>
                )}
                {/* Cuenta suspendida o dada de baja: se reactiva o se elimina la cuenta entera. */}
                {accountOff && canManage && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => openAccountAction(p, 'RESTORE')}>
                    Reactivar
                  </Button>
                )}
                {accountOff && canPurge && (
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => openAccountAction(p, 'PURGE')}>
                    Eliminar definitivamente
                  </Button>
                )}
                {!accountOff && (p.isPublished || p.verificationStatus === 'VERIFIED' || p.verificationStatus === 'SUSPENDED') && (
                  <Button
                    size="sm"
                    variant={p.verificationStatus === 'SUSPENDED' ? 'outline' : 'danger'}
                    disabled={busy}
                    onClick={() => toggleSuspend(p)}
                  >
                    {p.verificationStatus === 'SUSPENDED' ? 'Reactivar perfil' : 'Suspender perfil'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AccountActionDialog
        kind="professionals"
        request={request}
        onClose={() => setRequest(null)}
        onDone={(message) => {
          setRequest(null);
          setSuccess(message);
          void load();
        }}
      />
    </div>
  );
}
