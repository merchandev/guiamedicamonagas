'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import { newsletterApi, type CampaignDetail } from '@/lib/newsletter';
import { audienceLabel } from '../page';

export default function BoletinDetallePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(() => newsletterApi.getCampaign(id).then(setData), [id]);

  useEffect(() => {
    load().catch(() => setError('No se pudo cargar el boletín.'));
  }, [load]);

  // Mientras se está enviando, refresca el avance cada 4 s.
  useEffect(() => {
    if (data?.campaign.status !== 'SENDING') return;
    const t = setInterval(() => load().catch(() => undefined), 4000);
    return () => clearInterval(t);
  }, [data?.campaign.status, load]);

  if (!data && !error) return <PageSpinner />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return null;

  const { campaign, deliveries } = data;

  const resend = async () => {
    setError(null);
    setRetrying(true);
    try {
      await newsletterApi.resendFailed(campaign.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo reintentar.');
    } finally {
      setRetrying(false);
    }
  };

  const cancelSchedule = async () => {
    setError(null);
    try {
      await newsletterApi.cancelSchedule(campaign.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cancelar.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/boletines" className="text-sm text-pine-700 hover:underline">
          ← Boletines
        </Link>
        <h1 className="mt-1 text-2xl">{campaign.subject}</h1>
        <p className="text-sm text-ink-500">{audienceLabel(campaign)}</p>
      </div>

      {campaign.status === 'SCHEDULED' && campaign.scheduledAt && (
        <Alert tone="info">
          Programado para el {new Date(campaign.scheduledAt).toLocaleString('es-VE')}.{' '}
          <button onClick={cancelSchedule} className="font-medium underline">
            Cancelar programación
          </button>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold text-ink-900">{campaign.totalCount}</p>
          <p className="text-xs text-ink-500">Destinatarios</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold text-pine-700">{campaign.sentCount}</p>
          <p className="text-xs text-ink-500">Enviados</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold text-ink-900">{campaign.openCount}</p>
          <p className="text-xs text-ink-500">Aperturas</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold text-ink-900">{campaign.clickCount}</p>
          <p className="text-xs text-ink-500">Clics</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold text-red-600">{campaign.failedCount}</p>
          <p className="text-xs text-ink-500">Fallidos</p>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {campaign.failedCount > 0 && campaign.status !== 'SENDING' && (
        <Button onClick={resend} loading={retrying} variant="outline">
          Reintentar los {campaign.failedCount} fallidos
        </Button>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-ink-800">Registro de entregas</p>
        <div className="card divide-y divide-ink-50">
          {deliveries.length === 0 ? (
            <p className="p-4 text-sm text-ink-500">Todavía no hay entregas registradas.</p>
          ) : (
            deliveries.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="truncate text-ink-800">{d.email}</span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {d.error && <span className="text-xs text-ink-400">{d.error}</span>}
                  {d.clickedAt && <Badge tone="gold">Clic</Badge>}
                  {d.openedAt && !d.clickedAt && <Badge tone="pine">Abierto</Badge>}
                  <Badge tone={d.status === 'SENT' ? 'pine' : 'red'}>{d.status === 'SENT' ? 'Enviado' : 'Falló'}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
