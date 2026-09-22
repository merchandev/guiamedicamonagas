'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { BANKS_VENEZUELA } from '@/lib/monagas';
import { PAYMENT_STATUS_LABELS, PLAN_TIER_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels';
import { SubscriptionPlan } from '@/lib/types';
import { BcvRateBadge, formatBs, useExchangeRate } from '@/components/BcvRateBadge';

type Plan = SubscriptionPlan;

interface Installment {
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

interface PagoMovilAccount {
  bankName: string;
  bankCode: string;
  phone: string;
  documentId: string;
}

export default function PaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [account, setAccount] = useState<PagoMovilAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedBank, setSelectedBank] = useState(BANKS_VENEZUELA[0]);
  const rate = useExchangeRate();
  const exchangeRate = rate?.usdToBs ?? null;

  const load = async () => {
    const [sub, acc] = await Promise.all([
      api.get<Subscription | null>('/subscriptions/me').catch(() => null),
      api.get<PagoMovilAccount>('/payments/pago-movil-account').catch(() => null),
    ]);
    setSubscription(sub);
    setAccount(acc);
    if (!sub) {
      const allPlans = await api.get<Plan[]>('/subscriptions/plans').catch(() => []);
      setPlans(allPlans.filter((p) => p.tier !== 'FREE' && p.tier !== 'ORGANIZATION'));
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
  // El monto que se le pide pagar hoy usa la tasa BCV vigente en este momento
  // (no la que estaba al suscribirse), para que nunca pague de menos si el
  // bolívar se devaluó desde entonces. Nunca es menor al mínimo ya fijado.
  const liveAmountBs =
    subscription && exchangeRate
      ? Math.max(Number(subscription.plan.priceUsd) * exchangeRate, Number(pendingInstallment?.amountBs ?? 0))
      : Number(pendingInstallment?.amountBs ?? 0);

  const reportPayment = async (formData: FormData) => {
    if (!pendingInstallment) return;
    setSubmitting(true);
    setError(null);
    try {
      formData.append('installmentId', pendingInstallment.id);
      await api.upload('/payments', formData);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo reportar el pago');
    } finally {
      setSubmitting(false);
    }
  };

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
                <Button className="mt-4 w-full" onClick={() => subscribe(plan.id)}>
                  Elegir este plan
                </Button>
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

          {pendingInstallment && !hasPendingPayment && account && (
            <div className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-ink-900">Reportar Pago Móvil</h2>
                <BcvRateBadge className="rounded-full bg-pine-50 px-2.5 py-1 text-xs text-pine-800" />
              </div>
              <div className="mt-3 rounded-lg bg-pine-50 p-4 text-sm text-pine-900">
                <p><strong>Banco:</strong> {account.bankName} ({account.bankCode})</p>
                <p><strong>Teléfono:</strong> {account.phone}</p>
                <p><strong>Cédula/RIF:</strong> {account.documentId}</p>
                <p className="mt-1 text-base">
                  <strong>Monto a pagar hoy:</strong> Bs. {formatBs(liveAmountBs)}
                </p>
                <p className="mt-0.5 text-xs text-pine-700">
                  {subscription.plan.name}: ${subscription.plan.priceUsd} al cambio del día según el BCV.
                </p>
              </div>

              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  reportPayment(new FormData(e.currentTarget));
                }}
              >
                <Select
                  label="Banco emisor"
                  required
                  value={selectedBank.name}
                  onChange={(value) => {
                    const bank = BANKS_VENEZUELA.find((b) => b.name === value);
                    if (bank) setSelectedBank(bank);
                  }}
                  options={BANKS_VENEZUELA.map((b) => ({ value: b.name, label: b.name }))}
                />
                {/* El Select tiene estilo propio (no es un <select> nativo), así que su
                    valor no viaja solo con FormData: lo replicamos en inputs ocultos. */}
                <input type="hidden" name="senderBankName" value={selectedBank.name} />
                <input type="hidden" name="senderBankCode" value={selectedBank.code} />
                <Input label="Teléfono emisor" name="senderPhone" placeholder="0414-1234567" required />
                <Input label="N° de referencia (últimos dígitos)" name="referenceNumber" required />
                <Input label="Fecha del pago" name="paidAt" type="date" required />
                <Input
                  key={liveAmountBs}
                  label="Monto enviado (Bs)"
                  name="amountBs"
                  type="number"
                  step="0.01"
                  defaultValue={liveAmountBs.toFixed(2)}
                  hint="Precargado con la tasa BCV de hoy. Ajústalo si enviaste un monto distinto."
                  required
                />
                <div>
                  <label className="field-label">Comprobante de pago (captura o PDF)</label>
                  <input type="file" name="file" accept="application/pdf,image/*" required className="block w-full text-sm" />
                </div>
                <Button type="submit" loading={submitting} className="w-full">
                  Reportar pago
                </Button>
              </form>
            </div>
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
