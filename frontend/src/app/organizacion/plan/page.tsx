'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { PAYMENT_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels';
import type { SubscriptionPlan } from '@/lib/types';
import { canManage, useOrganization } from '@/components/organization/OrgContext';
import { PagoMovilReportForm, type PendingInstallment } from '@/components/PagoMovilReportForm';
import { BcvRateBadge, useExchangeRate } from '@/components/BcvRateBadge';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';

interface Installment extends PendingInstallment {
  status: string;
  payments: { id: string; status: string; amountBs: string; createdAt: string; reviewNote?: string | null }[];
}

interface Subscription {
  id: string;
  status: string;
  plan: SubscriptionPlan;
  currentPeriodEnd: string | null;
  installments: Installment[];
}

const STAT_LABELS: Record<string, string> = {
  PROFILE_VIEW: 'Visitas al perfil',
  WHATSAPP_CLICK: 'Clics en WhatsApp',
  PHONE_CLICK: 'Clics en teléfono',
  SOCIAL_LINK_CLICK: 'Clics en redes',
  MAP_CLICK: 'Clics en mapa',
};

export default function OrganizationPlanPage() {
  const { current: org, reload } = useOrganization();
  const rate = useExchangeRate();
  const [subscription, setSubscription] = useState<Subscription | null | undefined>(undefined);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const manager = canManage(org?.myRole);

  const load = useCallback(async () => {
    if (!org) return;
    const [sub, plans, st] = await Promise.all([
      manager ? api.get<Subscription | null>(`/subscriptions/organizations/${org.id}`).catch(() => null) : Promise.resolve(null),
      api.get<SubscriptionPlan[]>('/subscriptions/plans').catch(() => []),
      api.get<Record<string, number>>(`/organizations/me/${org.id}/stats`).catch(() => ({})),
    ]);
    setSubscription(sub);
    setPlan(plans.find((p) => p.tier === 'ORGANIZATION') ?? null);
    setStats(st);
  }, [org, manager]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!org || subscription === undefined) return <PageSpinner />;

  const subscribe = async () => {
    setSubscribing(true);
    setError(null);
    try {
      await api.post(`/subscriptions/organizations/${org.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo iniciar la suscripción');
    } finally {
      setSubscribing(false);
    }
  };

  const pending = subscription?.installments.find((i) => i.status === 'PENDING');
  const hasPendingPayment = pending?.payments.some((p) => p.status === 'PENDING');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl">Plan y estadísticas</h1>
        <BcvRateBadge className="rounded-full bg-pine-50 px-2.5 py-1 text-xs text-pine-800" />
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-ink-900">Estadísticas del perfil</h2>
        <p className="text-xs text-ink-400">Conteos anónimos de visitantes que aceptaron la analítica.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Object.entries(STAT_LABELS).map(([key, label]) => (
            <div key={key} className="rounded-lg bg-ink-50 p-4">
              <p className="text-2xl font-semibold text-ink-900">{stats[key] ?? 0}</p>
              <p className="text-xs text-ink-500">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {!manager ? (
        <Alert tone="info">Solo el dueño o un administrador de la organización puede gestionar el plan.</Alert>
      ) : !subscription ? (
        plan && (
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-ink-900">{plan.name}</h2>
            <p className="mt-1 text-2xl font-bold text-pine-700">
              ${plan.priceUsd}
              <span className="text-sm font-normal text-ink-400">/mes</span>
            </p>
            {rate?.usdToBs ? (
              <p className="text-xs text-ink-500">≈ Bs. {(Number(plan.priceUsd) * rate.usdToBs).toFixed(2)} a la tasa BCV de hoy</p>
            ) : null}
            <ul className="mt-3 space-y-1 text-sm text-ink-600">
              {(plan.features ?? []).map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-500">La verificación y el perfil básico siguen siendo gratuitos sin este plan.</p>
            <Button className="mt-4" loading={subscribing} onClick={subscribe}>
              Contratar plan
            </Button>
          </section>
        )
      ) : (
        <>
          <section className="card flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <p className="text-sm text-ink-500">{subscription.plan.name}</p>
              <Badge tone={SUBSCRIPTION_STATUS_LABELS[subscription.status]?.tone ?? 'neutral'}>
                {SUBSCRIPTION_STATUS_LABELS[subscription.status]?.label ?? subscription.status}
              </Badge>
            </div>
            {subscription.currentPeriodEnd && (
              <p className="text-sm text-ink-500">Vence: {new Date(subscription.currentPeriodEnd).toLocaleDateString('es-VE')}</p>
            )}
          </section>

          {pending && !hasPendingPayment && (
            <PagoMovilReportForm
              installment={pending}
              planName={subscription.plan.name}
              priceUsd={subscription.plan.priceUsd}
              onReported={async () => {
                await load();
                await reload();
              }}
            />
          )}
          {hasPendingPayment && <Alert tone="info">Tu pago fue reportado y está pendiente de revisión.</Alert>}

          <section className="card p-6">
            <h2 className="mb-3 text-lg font-semibold text-ink-900">Historial de pagos</h2>
            {subscription.installments.flatMap((i) => i.payments).length === 0 ? (
              <p className="text-sm text-ink-500">Aún no has reportado pagos.</p>
            ) : (
              <div className="space-y-2">
                {subscription.installments
                  .flatMap((i) => i.payments)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3 text-sm">
                      <span>
                        Bs. {p.amountBs} — {new Date(p.createdAt).toLocaleDateString('es-VE')}
                        {p.reviewNote && <span className="text-ink-400"> · {p.reviewNote}</span>}
                      </span>
                      <Badge tone={PAYMENT_STATUS_LABELS[p.status]?.tone ?? 'neutral'}>
                        {PAYMENT_STATUS_LABELS[p.status]?.label ?? p.status}
                      </Badge>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
