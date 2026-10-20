'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { newsletterApi, type CampaignStatus, type CampaignSummary } from '@/lib/newsletter';

const STATUS: Record<CampaignStatus, { label: string; tone: 'neutral' | 'pine' | 'gold' | 'red' | 'amber' }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  SCHEDULED: { label: 'Programado', tone: 'gold' },
  SENDING: { label: 'Enviando…', tone: 'amber' },
  SENT: { label: 'Enviado', tone: 'pine' },
  PARTIAL: { label: 'Parcial', tone: 'amber' },
  FAILED: { label: 'Falló', tone: 'red' },
};

export function audienceLabel(c: Pick<CampaignSummary, 'audienceList' | 'audiencePatients' | 'audienceProfessionals'>) {
  const parts: string[] = [];
  if (c.audienceList) parts.push('Lista propia');
  if (c.audiencePatients) parts.push('Pacientes');
  if (c.audienceProfessionals) parts.push('Médicos');
  return parts.join(' · ') || '—';
}

export default function BoletinesPage() {
  const router = useRouter();
  const [items, setItems] = useState<CampaignSummary[] | null>(null);

  useEffect(() => {
    newsletterApi.listCampaigns().then(setItems).catch(() => setItems([]));
  }, []);

  const duplicate = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const res = await newsletterApi.duplicate(id).catch(() => null);
    if (res) router.push(`/admin/boletines/${res.id}`);
  };

  if (!items) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Boletines</h1>
          <p className="text-sm text-ink-500">Envía boletines con el diseño de la marca y lleva el registro de cada envío.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/boletines/suscriptores">
            <Button variant="outline">Suscriptores</Button>
          </Link>
          <Link href="/admin/boletines/nuevo">
            <Button>Nuevo boletín</Button>
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Aún no hay boletines" description="Crea el primero y envíalo a tu lista o a los usuarios registrados." />
      ) : (
        <div className="card divide-y divide-ink-50">
          {items.map((c) => {
            const st = STATUS[c.status];
            return (
              <Link key={c.id} href={`/admin/boletines/${c.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-ink-50">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{c.subject}</p>
                  <p className="text-sm text-ink-500">
                    {audienceLabel(c)} · {new Date(c.createdAt).toLocaleDateString('es-VE')}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  {(c.status === 'SENT' || c.status === 'PARTIAL' || c.status === 'SENDING') && (
                    <span className="hidden text-sm text-ink-500 sm:inline">
                      {c.sentCount}/{c.totalCount}
                      {c.openCount > 0 && <span className="text-pine-700"> · {c.openCount} abiertos</span>}
                      {c.failedCount > 0 && <span className="text-red-600"> · {c.failedCount} fallos</span>}
                    </span>
                  )}
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <button
                    onClick={(e) => duplicate(e, c.id)}
                    className="rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                    title="Duplicar"
                  >
                    Duplicar
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
