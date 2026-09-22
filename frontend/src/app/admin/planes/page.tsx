'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { SubscriptionPlan } from '@/lib/types';
import { PLAN_TIER_LABELS } from '@/lib/labels';
import { ExchangeRate, formatBs, timeAgo } from '@/components/BcvRateBadge';

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [rate, setRate] = useState<number>(50);
  const [rateSaved, setRateSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingRate, setSavingRate] = useState(false);
  const [syncingBcv, setSyncingBcv] = useState(false);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { priceUsd: string; featuresText: string; isActive: boolean }>>({});

  const load = async () => {
    const [planList, rateData] = await Promise.all([
      api.get<SubscriptionPlan[]>('/subscriptions/admin/plans'),
      api.get<ExchangeRate>('/subscriptions/exchange-rate'),
    ]);
    setPlans(planList);
    setExchangeRate(rateData);
    setRate(rateData.usdToBs);
    setDrafts(
      Object.fromEntries(
        planList.map((p) => [p.id, { priceUsd: p.priceUsd, featuresText: (p.features ?? []).join('\n'), isActive: p.isActive }]),
      ),
    );
  };

  useEffect(() => {
    load();
  }, []);

  const saveRate = async () => {
    setSavingRate(true);
    setError(null);
    setRateSaved(false);
    try {
      await api.put('/subscriptions/admin/exchange-rate', { usdToBs: rate });
      setRateSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la tasa');
    } finally {
      setSavingRate(false);
    }
  };

  const syncWithBcv = async () => {
    setSyncingBcv(true);
    setError(null);
    setRateSaved(false);
    try {
      const result = await api.post<{ ok: boolean; usdToBs?: number; error?: string }>(
        '/subscriptions/admin/exchange-rate/sync-bcv',
      );
      if (!result.ok) {
        setError(result.error ?? 'No se pudo sincronizar con el BCV');
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo sincronizar con el BCV');
    } finally {
      setSyncingBcv(false);
    }
  };

  const savePlan = async (plan: SubscriptionPlan) => {
    const draft = drafts[plan.id];
    if (!draft) return;
    setSavingPlanId(plan.id);
    setError(null);
    try {
      await api.put(`/subscriptions/admin/plans/${plan.id}`, {
        tier: plan.tier,
        name: plan.name,
        description: plan.description ?? undefined,
        priceUsd: Number(draft.priceUsd),
        billingCycle: plan.billingCycle,
        maxLocations: plan.maxLocations,
        postsLimit: plan.postsLimit ?? undefined,
        features: draft.featuresText.split('\n').map((f) => f.trim()).filter(Boolean),
        isActive: draft.isActive,
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el plan');
    } finally {
      setSavingPlanId(null);
    }
  };

  if (!plans) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Planes y tasa de cambio</h1>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="card space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-ink-900">Tasa de cambio USD → Bs</h2>
          {exchangeRate && (
            <Badge tone={exchangeRate.source === 'BCV' ? 'pine' : 'amber'}>
              {exchangeRate.source === 'BCV' ? 'Automática (BCV)' : 'Manual'} · Bs {formatBs(exchangeRate.usdToBs)} ·{' '}
              {timeAgo(exchangeRate.updatedAt)}
            </Badge>
          )}
        </div>
        <p className="text-sm text-ink-600">
          Se sincroniza automáticamente con el BCV cada hora y se usa para calcular en bolívares lo que debe pagar un
          profesional. Si el BCV no está disponible, puedes fijarla manualmente aquí.
        </p>
        {exchangeRate?.lastBcvSyncError && (
          <Alert tone="warning">Último intento de sincronización con el BCV falló: {exchangeRate.lastBcvSyncError}</Alert>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="outline" onClick={syncWithBcv} loading={syncingBcv}>
            Sincronizar con BCV ahora
          </Button>
        </div>
        <div className="flex items-end gap-3 border-t border-ink-100 pt-3">
          <Input
            label="Fijar manualmente: 1 USD equivale a (Bs)"
            type="number"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="max-w-xs"
          />
          <Button onClick={saveRate} loading={savingRate}>
            Guardar tasa manual
          </Button>
          {rateSaved && <Badge tone="pine">Guardada</Badge>}
        </div>
      </div>

      <div className="space-y-4">
        {plans.map((plan) => {
          const draft = drafts[plan.id];
          if (!draft) return null;
          return (
            <div key={plan.id} className="card space-y-3 p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink-900">
                  {plan.name} <Badge tone={PLAN_TIER_LABELS[plan.tier]?.tone ?? 'neutral'} className="ml-2">{plan.tier}</Badge>
                </h3>
                <label className="flex items-center gap-2 text-sm text-ink-600">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => setDrafts({ ...drafts, [plan.id]: { ...draft, isActive: e.target.checked } })}
                    className="h-4 w-4 rounded border-ink-300 text-pine-700"
                  />
                  Activo
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <Input
                  label="Precio (USD/mes)"
                  type="number"
                  step="0.01"
                  value={draft.priceUsd}
                  onChange={(e) => setDrafts({ ...drafts, [plan.id]: { ...draft, priceUsd: e.target.value } })}
                />
                <Textarea
                  label="Beneficios (uno por línea)"
                  rows={4}
                  value={draft.featuresText}
                  onChange={(e) => setDrafts({ ...drafts, [plan.id]: { ...draft, featuresText: e.target.value } })}
                />
              </div>
              <Button size="sm" loading={savingPlanId === plan.id} onClick={() => savePlan(plan)}>
                Guardar plan
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
