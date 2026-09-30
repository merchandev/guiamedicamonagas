'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBanks } from '@/lib/catalogs';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface PagoMovilAccount {
  configured: boolean;
  holderName: string | null;
  documentId: string | null;
  bankCode: string | null;
  bankName: string | null;
  accountNumber: string | null;
  phone: string | null;
}

const EMPTY = { holderName: '', documentId: '', bankCode: '', accountNumber: '', phone: '' };
const digits = (value: string) => value.replace(/\D/g, '');

/**
 * Cuenta que recibe los Pagos Móviles de las suscripciones. La ven los médicos
 * y las organizaciones dentro de su panel, al reportar un pago; nunca es pública.
 */
export function PagoMovilAccountCard() {
  const { user } = useAuth();
  const canEdit = !!user?.permissions.includes('MANAGE_PLANS');
  const banks = useBanks();
  const [account, setAccount] = useState<PagoMovilAccount | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<PagoMovilAccount>('/payments/admin/pago-movil-account').then(setAccount).catch(() => setError('No se pudieron cargar los datos de Pago Móvil.'));
  }, []);

  const startEditing = () => {
    setForm({
      holderName: account?.holderName ?? '',
      documentId: account?.documentId ?? '',
      bankCode: account?.bankCode ?? '',
      accountNumber: account?.accountNumber ?? '',
      phone: account?.phone ?? '',
    });
    setError(null);
    setSaved(false);
    setEditing(true);
  };

  const accountDigits = digits(form.accountNumber);
  const accountMismatch = accountDigits.length === 20 && !!form.bankCode && !accountDigits.startsWith(form.bankCode);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || accountMismatch) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put<PagoMovilAccount>('/payments/admin/pago-movil-account', {
        holderName: form.holderName.trim(),
        documentId: form.documentId.trim(),
        bankCode: form.bankCode,
        accountNumber: form.accountNumber,
        phone: form.phone,
      });
      setAccount(updated);
      setEditing(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron guardar los datos. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <section className="card p-6" aria-labelledby="pago-movil-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pago-movil-titulo" className="text-lg font-semibold text-ink-900">
            Mi Pago Móvil para recibir pagos
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            A estos datos pagan los médicos su plan. Solo los ven con su sesión iniciada, dentro de su panel, en «Suscripción
            y pagos»; desde ahí mismo reportan el pago. No se publican en el sitio.
          </p>
        </div>
        {account && <Badge tone={account.configured ? 'pine' : 'amber'}>{account.configured ? 'Registrado' : 'Sin registrar'}</Badge>}
      </div>

      {saved && !editing && (
        <div role="status" className="mt-4">
          <Alert tone="success">Datos guardados. Ya son los que ven los médicos al pagar.</Alert>
        </div>
      )}
      {error && !editing && <Alert tone="error" className="mt-4">{error}</Alert>}

      {account && !editing && (
        <>
          {account.configured ? (
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ['Titular', account.holderName],
                ['Cédula o RIF', account.documentId],
                ['Banco', account.bankCode ? `${account.bankCode} · ${account.bankName ?? ''}` : null],
                ['Teléfono', account.phone],
                ['Número de cuenta', account.accountNumber],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="break-words font-medium text-ink-900">{value || 'Sin registrar'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Alert tone="warning" className="mt-4">
              Aún no has registrado tu Pago Móvil. Mientras falte, un médico que elija un plan no ve a dónde pagar ni puede
              reportar su pago.
            </Alert>
          )}
          {canEdit ? (
            <Button className="mt-4" variant={account.configured ? 'outline' : 'primary'} onClick={startEditing}>
              {account.configured ? 'Cambiar datos' : 'Registrar mi Pago Móvil'}
            </Button>
          ) : (
            <p className="mt-4 text-xs text-ink-500">Solo el superadministrador puede cambiar estos datos.</p>
          )}
        </>
      )}

      {editing && (
        <form className="mt-4 space-y-4" onSubmit={save}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombre del titular" name="pm-titular" required minLength={3} maxLength={120} autoComplete="off" value={form.holderName} onChange={set('holderName')} />
            <Input
              label="Cédula o RIF del titular"
              name="pm-documento"
              required
              placeholder="V-12345678"
              autoComplete="off"
              pattern="[VEJPGvejpg]-?[0-9]{5,9}(-?[0-9])?"
              title="Ejemplo: V-12345678 o J-12345678-9"
              value={form.documentId}
              onChange={set('documentId')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Banco (código)"
              required
              value={form.bankCode}
              onChange={(bankCode) => setForm((f) => ({ ...f, bankCode }))}
              options={[
                { value: '', label: 'Selecciona el banco' },
                ...banks.filter((b) => b.supportsPagoMovil).map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` })),
              ]}
            />
            <Input
              label="Teléfono del Pago Móvil"
              name="pm-telefono"
              required
              inputMode="tel"
              placeholder="0414-1234567"
              autoComplete="off"
              pattern="04[0-9]{2}-?[0-9]{7}"
              title="Ejemplo: 0414-1234567"
              value={form.phone}
              onChange={set('phone')}
            />
          </div>
          <Input
            label="Número de cuenta (20 dígitos)"
            name="pm-cuenta"
            required
            inputMode="numeric"
            placeholder="0134 0000 00 0000000000"
            autoComplete="off"
            value={form.accountNumber}
            onChange={set('accountNumber')}
            error={
              accountMismatch
                ? `El número de cuenta debe empezar por el código del banco (${form.bankCode}).`
                : accountDigits.length > 0 && accountDigits.length !== 20
                  ? `Llevas ${accountDigits.length} de 20 dígitos.`
                  : undefined
            }
          />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving} disabled={!form.bankCode || accountDigits.length !== 20 || accountMismatch}>
              Guardar datos
            </Button>
          </div>
          <p className="text-xs text-ink-500">Cada cambio queda registrado en la auditoría con tu usuario.</p>
        </form>
      )}
    </section>
  );
}
