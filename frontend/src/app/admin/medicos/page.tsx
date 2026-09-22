'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';
import { VERIFICATION_LABELS } from '@/lib/labels';

interface AdminProfessional {
  id: string;
  firstName: string;
  lastName: string;
  slug: string;
  verificationStatus: string;
  isPublished: boolean;
  user: { email: string; isEmailVerified: boolean };
}

export default function AdminDoctorsPage() {
  const [items, setItems] = useState<AdminProfessional[] | null>(null);
  const [status, setStatus] = useState('');

  const load = () =>
    api
      .get<{ items: AdminProfessional[] }>(`/professionals/admin/list?limit=100${status ? `&status=${status}` : ''}`)
      .then((res) => setItems(res.items));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const toggleSuspend = async (professional: AdminProfessional) => {
    const suspended = professional.verificationStatus !== 'SUSPENDED';
    const note = suspended ? window.prompt('Motivo de la suspensión:') : undefined;
    if (suspended && !note) return;
    await api.patch(`/professionals/admin/${professional.id}/suspend`, { suspended, note });
    load();
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

      <div className="card divide-y divide-ink-50">
        {items.map((p) => {
          const s = VERIFICATION_LABELS[p.verificationStatus];
          return (
            <div key={p.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-ink-900">
                  Dr(a). {p.firstName} {p.lastName}
                </p>
                <p className="text-sm text-ink-500">{p.user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {s && <Badge tone={s.tone}>{s.label}</Badge>}
                {p.isPublished && (
                  <Link href={`/medicos/${p.slug}`} target="_blank" className="text-sm text-pine-700 hover:underline">
                    Ver perfil
                  </Link>
                )}
                {(p.verificationStatus === 'VERIFIED' || p.verificationStatus === 'SUSPENDED') && (
                  <Button
                    size="sm"
                    variant={p.verificationStatus === 'SUSPENDED' ? 'outline' : 'danger'}
                    onClick={() => toggleSuspend(p)}
                  >
                    {p.verificationStatus === 'SUSPENDED' ? 'Reactivar' : 'Suspender'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
