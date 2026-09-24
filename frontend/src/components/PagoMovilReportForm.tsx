'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useBanks } from '@/lib/catalogs';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { BcvRateBadge, formatBs, useExchangeRate } from '@/components/BcvRateBadge';

export interface PendingInstallment {
  id: string;
  amountBs: string;
  priceUsd?: string | null;
  bcvRate?: string | null;
  rateCapturedAt?: string | null;
}

interface PagoMovilAccount {
  bankName: string;
  bankCode: string;
  phone: string;
  documentId: string;
}

/**
 * Reporte de un Pago Móvil para una cuota. Muestra el monto fijado al
 * suscribirse (con la tasa BCV usada) y el monto a la tasa de hoy — nunca
 * menos que el fijado — y lista los bancos desde el catálogo administrable.
 */
export function PagoMovilReportForm({
  installment,
  planName,
  priceUsd,
  onReported,
}: {
  installment: PendingInstallment;
  planName: string;
  priceUsd: string;
  onReported: () => void | Promise<void>;
}) {
  const banks = useBanks();
  const rate = useExchangeRate();
  const [account, setAccount] = useState<PagoMovilAccount | null>(null);
  const [bankCode, setBankCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PagoMovilAccount>('/payments/pago-movil-account').then(setAccount).catch(() => undefined);
  }, []);

  const exchangeRate = rate?.usdToBs ?? null;
  const liveAmountBs = exchangeRate
    ? Math.max(Number(priceUsd) * exchangeRate, Number(installment.amountBs))
    : Number(installment.amountBs);

  const submit = async (formData: FormData) => {
    setSubmitting(true);
    setError(null);
    try {
      formData.append('installmentId', installment.id);
      await api.upload('/payments', formData);
      await onReported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo reportar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  if (!account) return null;

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink-900">Reportar Pago Móvil</h2>
        <BcvRateBadge className="rounded-full bg-pine-50 px-2.5 py-1 text-xs text-pine-800" />
      </div>
      <div className="mt-3 rounded-lg bg-pine-50 p-4 text-sm text-pine-900">
        <p>
          <strong>Banco:</strong> {account.bankName} ({account.bankCode})
        </p>
        <p>
          <strong>Teléfono:</strong> {account.phone}
        </p>
        <p>
          <strong>Cédula/RIF:</strong> {account.documentId}
        </p>
        <p className="mt-1 text-base">
          <strong>Monto a pagar hoy:</strong> Bs. {formatBs(liveAmountBs)}
        </p>
        <p className="mt-0.5 text-xs text-pine-700">
          {planName}: ${priceUsd} al cambio del día según el BCV.
          {installment.bcvRate && installment.rateCapturedAt && (
            <>
              {' '}
              Monto fijado al suscribirte: Bs. {formatBs(Number(installment.amountBs))} (tasa{' '}
              {Number(installment.bcvRate).toLocaleString('es-VE')} del{' '}
              {new Date(installment.rateCapturedAt).toLocaleDateString('es-VE')}).
            </>
          )}
        </p>
      </div>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <Select
          label="Banco emisor"
          required
          value={bankCode}
          onChange={setBankCode}
          options={[
            { value: '', label: 'Selecciona tu banco' },
            ...banks.filter((b) => b.supportsPagoMovil).map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` })),
          ]}
        />
        {/* El Select tiene estilo propio (no es un <select> nativo): su valor viaja en un input oculto. */}
        <input type="hidden" name="senderBankCode" value={bankCode} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Teléfono emisor" name="senderPhone" placeholder="0414-1234567" required />
          <Input label="N° de referencia (últimos dígitos)" name="referenceNumber" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
        <div>
          <label htmlFor="pago-comprobante" className="field-label">
            Comprobante de pago (captura o PDF)
          </label>
          <input
            id="pago-comprobante"
            type="file"
            name="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            required
            className="block w-full text-sm text-ink-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-solid file:border-ink-300 file:bg-white file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-ink-800 hover:file:bg-ink-50"
          />
        </div>
        <Button type="submit" loading={submitting} disabled={!bankCode} className="w-full">
          Reportar pago
        </Button>
      </form>
    </div>
  );
}
