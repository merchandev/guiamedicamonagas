'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useRealtimeRefresh } from '@/lib/realtime';
import { formatDate } from '@/lib/dates';
import { PRESCRIPTION_PATIENT_NOTICE } from '@/lib/legal';
import { normalizePrescriptionCode, PRESCRIPTION_STATUS, type PatientPrescriptionSummary } from '@/lib/prescriptions';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';

export default function PatientPrescriptionsPage() {
  const router = useRouter();
  const [items, setItems] = useState<PatientPrescriptionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(() => {
    api.get<PatientPrescriptionSummary[]>('/prescriptions/me').then(setItems, (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus récipes'),
    );
  }, []);

  useEffect(load, [load]);
  useRealtimeRefresh(['prescriptions'], load);

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    const normalized = normalizePrescriptionCode(code);
    if (!normalized) {
      setCodeError('El código tiene 12 letras y números, por ejemplo K7Q4-M9TX-P3WD.');
      return;
    }
    setClaiming(true);
    try {
      const result = await api.post<{ id: string; alreadySaved: boolean }>('/prescriptions/claim', { code: normalized });
      router.push(`/paciente/recipes/${result.id}`);
    } catch (err) {
      setCodeError(err instanceof ApiError ? err.message : 'No se pudo agregar el récipe');
      setClaiming(false);
    }
  };

  if (!items) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Mis récipes</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">{PRESCRIPTION_PATIENT_NOTICE}</p>
      </div>

      <form onSubmit={claim} aria-labelledby="agregar-recipe" className="card space-y-3 p-5">
        <h2 id="agregar-recipe" className="text-lg font-semibold text-ink-900">
          Agregar un récipe con su código
        </h2>
        <p className="text-sm text-ink-600">
          Si tu médico te lo envió por WhatsApp, por correo o impreso, escribe el código que trae. Se guarda en tu cuenta si la
          cédula del récipe es la tuya (o la que diste como representante).
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-72">
            <Input
              label="Código del récipe"
              placeholder="K7Q4-M9TX-P3WD"
              autoComplete="off"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={codeError ?? undefined}
            />
          </div>
          <Button type="submit" loading={claiming}>
            Agregar
          </Button>
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState
          title="Aún no tienes récipes aquí"
          description="Cuando un médico te entregue un récipe en la plataforma, o lo agregues con su código, aparecerá en esta lista."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/paciente/recipes/${item.id}`} className="card block p-4 transition-colors hover:border-pine-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink-900">
                    Dr(a). {item.doctor.name} · N° {item.numberLabel}
                  </p>
                  <Badge tone={PRESCRIPTION_STATUS[item.status].tone}>{PRESCRIPTION_STATUS[item.status].label}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-700">
                  {item.itemsSummary} · para {item.patientName}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Emitido el {formatDate(item.issuedAt, { dateStyle: 'long' })} · vence el {formatDate(item.expiresAt, { dateStyle: 'long' })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
