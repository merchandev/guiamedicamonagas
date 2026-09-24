'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PAYMENT_STATUS_LABELS, PLAN_TIER_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels';
import { ProfessionalProgress, SubscriptionPlan } from '@/lib/types';
import { BcvRateBadge, useExchangeRate } from '@/components/BcvRateBadge';
import { PagoMovilReportForm, type PendingInstallment } from '@/components/PagoMovilReportForm';

type Plan = SubscriptionPlan;

// Deben coincidir con FULL_DOCUMENTS_TIERS del backend (publication-rules.ts).
const FULL_DOCUMENTS_TIERS = ['PROFESSIONAL_PLUS', 'PREMIUM'];

interface Installment extends PendingInstallment {
  id: string;
  amountBs: string;
  status: string;
  payments: { id: string; status: string; amountBs: string; createdAt: string; reviewNote?: string }[];
}

interface Subscription {
  id: string;
  status: string;
  plan: Plan;
  currentPeriodEnd: string | null;
  installments: Installment[];
}

export default function PaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ProfessionalProgress['documents'] | null>(null);
  const rate = useExchangeRate();
  const exchangeRate = rate?.usdToBs ?? null;

  const load = async () => {
    const sub = await api.get<Subscription | null>('/subscriptions/me').catch(() => null);
    setSubscription(sub);
    if (!sub) {
      const [allPlans, own] = await Promise.all([
        api.get<Plan[]>('/subscriptions/plans').catch(() => []),
        api.get<{ progress?: ProfessionalProgress }>('/professionals/me').catch(() => null),
      ]);
      setPlans(allPlans.filter((p) => p.tier !== 'FREE' && p.tier !== 'ORGANIZATION'));
      setDocuments(own?.progress?.documents ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const subscribe = async (planId: string) => {
    setError(null);
    try {
      await api.post('/subscriptions/me', { planId });
      setLoading(true);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo iniciar la suscripción');
    }
  };

  const pendingInstallment = subscription?.installments.find((i) => i.status === 'PENDING');
  const hasPendingPayment = pendingInstallment?.payments.some((p) => p.status === 'PENDING');
  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl">Suscripción y pagos</h1>
        <BcvRateBadge className="rounded-full bg-pine-50 px-2.5 py-1 text-xs text-pine-800" />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {!subscription ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {plans.length === 0 ? (
            <EmptyState title="Aún no hay planes disponibles" description="Vuelve pronto." />
          ) : (
            plans.map((plan) => (
              <div key={plan.id} className="card p-6">
                <h3 className="text-lg font-semibold text-ink-900">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold text-pine-700">${plan.priceUsd}<span className="text-sm font-normal text-ink-400">/mes</span></p>
                {exchangeRate && (
                  <p className="text-xs text-ink-500">
                    ≈ Bs. {(Number(plan.priceUsd) * exchangeRate).toFixed(2)} al pagar
                  </p>
                )}
                {plan.description && <p className="mt-2 text-sm text-ink-600">{plan.description}</p>}
                <ul className="mt-3 space-y-1 text-xs text-ink-500">
                  {(plan.features ?? []).slice(0, 4).map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
                {FULL_DOCUMENTS_TIERS.includes(plan.tier) && documents && documents.approved < documents.required ? (
                  <>
                    <Button className="mt-4 w-full" variant="outline" disabled>
                      Requiere el 100% de tus documentos
                    </Button>
                    <p className="mt-2 text-xs text-ink-500">
                      Tienes {documents.approved} de {documents.required} documentos aprobados.
                    </p>
                  </>
                ) : (
                  <Button className="mt-4 w-full" onClick={() => subscribe(plan.id)}>
                    Elegir este plan
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-500">{subscription.plan.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={SUBSCRIPTION_STATUS_LABELS[subscription.status]?.tone ?? 'neutral'}>
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]?.label ?? subscription.status}
                  </Badge>
                  {PLAN_TIER_LABELS[subscription.plan.tier] && (
                    <Badge tone={PLAN_TIER_LABELS[subscription.plan.tier].tone}>
                      {PLAN_TIER_LABELS[subscription.plan.tier].label}
                    </Badge>
                  )}
                </div>
              </div>
              {subscription.currentPeriodEnd && (
                <p className="text-sm text-ink-500">
                  Vence: {new Date(subscription.currentPeriodEnd).toLocaleDateString('es-VE')}
                </p>
              )}
            </div>
          </div>

          {pendingInstallment && !hasPendingPayment && (
            <PagoMovilReportForm
              installment={pendingInstallment}
              planName={subscription.plan.name}
              priceUsd={subscription.plan.priceUsd}
              onReported={load}
            />
          )}

          {hasPendingPayment && (
            <Alert tone="info">Tu pago fue reportado y está pendiente de revisión por un administrador.</Alert>
          )}

          <div className="card p-6">
            <h2 className="mb-3 text-lg font-semibold text-ink-900">Historial de pagos</h2>
            <div className="space-y-2">
              {subscription.installments.flatMap((i) => i.payments).length === 0 ? (
                <p className="text-sm text-ink-500">Aún no has reportado pagos.</p>
              ) : (
                subscription.installments
                  .flatMap((i) => i.payments)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3 text-sm">
                      <span>Bs. {p.amountBs} — {new Date(p.createdAt).toLocaleDateString('es-VE')}</span>
                      <Badge tone={PAYMENT_STATUS_LABELS[p.status]?.tone ?? 'neutral'}>
                        {PAYMENT_STATUS_LABELS[p.status]?.label ?? p.status}
                      </Badge>
                    </div>
                  ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
