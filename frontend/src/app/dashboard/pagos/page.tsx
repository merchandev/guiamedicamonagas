'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useRealtimeRefresh } from '@/lib/realtime';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PAYMENT_STATUS_LABELS, PLAN_TIER_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels';
import { DoctorPlanStatus, ProfessionalProgress, SubscriptionPlan } from '@/lib/types';
import { BcvRateBadge, useExchangeRate } from '@/components/BcvRateBadge';
import { PagoMovilReportForm, type PendingInstallment } from '@/components/PagoMovilReportForm';
import { PlanStatusCard } from '@/components/PlanStatusCard';
import { formatDate } from '@/lib/dates';

type Plan = SubscriptionPlan;

// Deben coincidir con FULL_DOCUMENTS_TIERS del backend (publication-rules.ts).
const FULL_DOCUMENTS_TIERS = ['PROFESSIONAL_PLUS', 'PREMIUM', 'AGENCY'];

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

// En curso: la que se está pagando o la vigente. Una vencida queda en el historial y se puede renovar.
const ONGOING = ['PENDING', 'ACTIVE'];

export default function PaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ProfessionalProgress['documents'] | null>(null);
  const [planStatus, setPlanStatus] = useState<DoctorPlanStatus | null>(null);
  const rate = useExchangeRate();
  const exchangeRate = rate?.usdToBs ?? null;

  const load = useCallback(
    () =>
      Promise.all([
        api.get<Subscription | null>('/subscriptions/me').catch(() => null),
        api.get<Plan[]>('/subscriptions/plans').catch(() => []),
        api.get<{ progress?: ProfessionalProgress; plan?: DoctorPlanStatus }>('/professionals/me').catch(() => null),
      ]).then(([sub, allPlans, own]) => {
        setSubscription(sub);
        setPlans(allPlans.filter((p) => p.tier !== 'FREE' && p.tier !== 'ORGANIZATION'));
        setDocuments(own?.progress?.documents ?? null);
        setPlanStatus(own?.plan ?? null);
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeRefresh(['billing', 'documents', 'profile'], load);

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

  const current = subscription && ONGOING.includes(subscription.status) ? subscription : null;
  const pendingInstallment = current?.installments.find((i) => i.status === 'PENDING');
  const hasPendingPayment = pendingInstallment?.payments.some((p) => p.status === 'PENDING');
  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl">Suscripción y pagos</h1>
        <BcvRateBadge className="rounded-full bg-pine-50 px-2.5 py-1 text-xs text-pine-800" />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {planStatus && !current && <PlanStatusCard plan={planStatus} withLink={false} />}

      {subscription?.status === 'PAST_DUE' && subscription.currentPeriodEnd && (
        <p className="text-sm text-ink-600">
          Tu plan {subscription.plan.name} venció el {formatDate(subscription.currentPeriodEnd)}. Puedes renovarlo o elegir otro.
        </p>
      )}

      {!current && plans.length > 0 && (
        <p className="text-xs text-ink-500">
          Al elegir un plan aceptas las condiciones de{' '}
          <Link href="/pagos-y-suscripciones" target="_blank" className="font-medium text-pine-700 underline">
            Pagos y suscripciones
          </Link>{' '}
          y de{' '}
          <Link href="/reembolsos" target="_blank" className="font-medium text-pine-700 underline">
            Cancelación y reembolsos
          </Link>
          . Un plan añade herramientas y visibilidad: no compra ni acelera la verificación.
        </p>
      )}

      {!current ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {plans.length === 0 ? (
            <EmptyState title="Aún no hay planes disponibles" description="Vuelve pronto." />
          ) : (
            plans.map((plan) => (
              <div key={plan.id} className={plan.tier === 'AGENCY' ? 'card border-gold-300 bg-gold-50/40 p-6' : 'card p-6'}>
                <h3 className="text-lg font-semibold text-ink-900">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold text-pine-700">${plan.priceUsd}<span className="text-sm font-normal text-ink-500">/mes</span></p>
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
                <p className="text-sm text-ink-500">{current.plan.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={SUBSCRIPTION_STATUS_LABELS[current.status]?.tone ?? 'neutral'}>
                    {SUBSCRIPTION_STATUS_LABELS[current.status]?.label ?? current.status}
                  </Badge>
                  {PLAN_TIER_LABELS[current.plan.tier] && (
                    <Badge tone={PLAN_TIER_LABELS[current.plan.tier].tone}>
                      {PLAN_TIER_LABELS[current.plan.tier].label}
                    </Badge>
                  )}
                </div>
              </div>
              {current.currentPeriodEnd && (
                <p className="text-sm text-ink-500">
                  Vence: {formatDate(current.currentPeriodEnd)}
                </p>
              )}
            </div>
          </div>

          {pendingInstallment && !hasPendingPayment && (
            <PagoMovilReportForm
              installment={pendingInstallment}
              planName={current.plan.name}
              priceUsd={current.plan.priceUsd}
              onReported={load}
            />
          )}

          {hasPendingPayment && (
            <Alert tone="info">Tu pago fue reportado y está pendiente de revisión por un administrador.</Alert>
          )}

          <div className="card p-6">
            <h2 className="mb-3 text-lg font-semibold text-ink-900">Historial de pagos</h2>
            <div className="space-y-2">
              {current.installments.flatMap((i) => i.payments).length === 0 ? (
                <p className="text-sm text-ink-500">Aún no has reportado pagos.</p>
              ) : (
                current.installments
                  .flatMap((i) => i.payments)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3 text-sm">
                      <span>Bs. {p.amountBs} — {formatDate(p.createdAt)}</span>
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
