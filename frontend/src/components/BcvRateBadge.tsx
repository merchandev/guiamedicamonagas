'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

export interface ExchangeRate {
  usdToBs: number;
  updatedAt: string;
  source: 'BCV' | 'MANUAL';
  effectiveDate?: string;
  lastBcvSyncAt?: string;
  lastBcvSyncError?: string;
}

export function formatBs(value: number) {
  return value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'justo ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

/** Hook reutilizable: expone la tasa BCV vigente y la refresca cada 5 min. */
export function useExchangeRate() {
  const [rate, setRate] = useState<ExchangeRate | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .get<ExchangeRate>('/subscriptions/exchange-rate')
        .then((data) => !cancelled && setRate(data))
        .catch(() => undefined);
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return rate;
}

export function BcvRateBadge({ className, showAge = true }: { className?: string; showAge?: boolean }) {
  const rate = useExchangeRate();
  if (!rate) return null;
  if (!Number.isFinite(rate.usdToBs) || rate.usdToBs <= 0) {
    return <span className={className}>Tasa USD no disponible</span>;
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title={`Tasa ${rate.source === 'BCV' ? 'publicada por el BCV' : 'manual'}, consultada ${timeAgo(rate.updatedAt)}${rate.lastBcvSyncError ? '. La última sincronización falló; se conserva el valor anterior.' : ''}`}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-70" />
      {rate.source === 'BCV' ? 'USD BCV' : 'USD · tasa manual'} <span className="font-semibold">Bs {formatBs(rate.usdToBs)}</span>
      {showAge && <span className="hidden opacity-70 sm:inline">· {rate.effectiveDate ? `Fecha valor ${rate.effectiveDate.split('-').reverse().join('/')}` : timeAgo(rate.updatedAt)}</span>}
      {rate.lastBcvSyncError && <span className="opacity-80">· sin actualizar</span>}
    </span>
  );
}
