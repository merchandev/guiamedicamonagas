'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { LockIcon } from '@/components/icons';

interface VaultStatus {
  configured: boolean;
  unlocked: boolean;
  expiresAt: string | null;
}

const VaultContext = createContext<{ relock: () => void }>({ relock: () => undefined });

/** Para las páginas dentro de la bóveda: si el backend responde que se cerró, se vuelve a pedir el código. */
export const usePatientVault = () => useContext(VaultContext);

export function isVaultLocked(error: unknown) {
  return error instanceof ApiError && error.status === 403 && (error.data as { code?: string } | null)?.code === 'PATIENT_VAULT_LOCKED';
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Los registros de pacientes están protegidos incluso para la administración:
 * además de la sesión y los permisos, se pide el código de seguridad. La
 * bóveda se abre 15 minutos (cookie httpOnly que solo viaja a esas rutas) y
 * cada apertura queda en la auditoría.
 */
export function PatientVaultGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api
      .get<VaultStatus>('/patients/admin/vault')
      .then(setStatus)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo consultar el acceso a pacientes'));
  }, []);

  const expiresAt = status?.unlocked && status.expiresAt ? new Date(status.expiresAt).getTime() : null;

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const relock = useCallback(() => setStatus((prev) => (prev ? { ...prev, unlocked: false, expiresAt: null } : prev)), []);

  useEffect(() => {
    if (expiresAt && now >= expiresAt) relock();
  }, [expiresAt, now, relock]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<VaultStatus>('/patients/admin/vault/unlock', { code });
      setNow(Date.now());
      setStatus(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo abrir el acceso');
    } finally {
      setCode('');
      setSubmitting(false);
    }
  };

  const lock = async () => {
    await api.post('/patients/admin/vault/lock').catch(() => undefined);
    relock();
  };

  if (!status) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  if (!status.configured) {
    return (
      <Alert tone="warning">
        Los registros de pacientes están cerrados: falta configurar el código de seguridad en el servidor
        (scripts/set-patient-vault-code.sh).
      </Alert>
    );
  }

  if (!status.unlocked || !expiresAt) {
    return (
      <form onSubmit={unlock} className="card mx-auto max-w-md space-y-4 p-6" aria-labelledby="boveda-titulo">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pine-50 text-pine-700">
          <LockIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 id="boveda-titulo" className="text-xl">
            Registros de pacientes protegidos
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Ingresa el código de seguridad para verlos durante 15 minutos. Cada acceso y cada intento fallido quedan
            registrados; tras 5 intentos fallidos se bloquea por 15 minutos.
          </p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <Input
          id="codigo-boveda"
          label="Código de seguridad"
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <Button type="submit" loading={submitting} disabled={!code} className="w-full">
          Abrir registros
        </Button>
      </form>
    );
  }

  return (
    <VaultContext.Provider value={{ relock }}>
      <div className="space-y-4">
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold-200 bg-gold-50 px-4 py-2.5 text-sm text-gold-800"
        >
          <span className="flex items-center gap-2">
            <LockIcon className="h-4 w-4" />
            Registros de pacientes abiertos · se cierran en {formatRemaining(expiresAt - now)}
          </span>
          <Button variant="outline" size="sm" onClick={lock}>
            Cerrar ahora
          </Button>
        </div>
        {children}
      </div>
    </VaultContext.Provider>
  );
}
