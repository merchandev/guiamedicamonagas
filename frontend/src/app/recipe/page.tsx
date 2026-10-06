'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, apiBlob, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PRESCRIPTION_VERIFY_NOTICE } from '@/lib/legal';
import { normalizePrescriptionCode, PRESCRIPTION_STATUS, type VerifiedPrescription } from '@/lib/prescriptions';
import { fetchPrescriptionsConfig } from '@/lib/use-prescriptions';
import { PrescriptionPaper } from '@/components/prescriptions/PrescriptionPaper';
import { PrescriptionShare } from '@/components/prescriptions/PrescriptionShare';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';

const STATUS_TEXT = {
  VALID: 'Es auténtico y está vigente.',
  EXPIRED: 'Es auténtico, pero venció: ya no sirve para comprar medicamentos.',
  ANNULLED: 'El médico lo anuló: no sirve para comprar medicamentos.',
} as const;

export default function VerifyPrescriptionPage() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<VerifiedPrescription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const verify = useCallback((normalized: string) => {
    setChecking(true);
    setError(null);
    setClaimNotice(null);
    return api
      .post<VerifiedPrescription>('/prescriptions/verify', { code: normalized })
      .then(setResult, (e) => {
        setResult(null);
        setError(e instanceof ApiError ? e.message : 'No se pudo verificar el récipe');
      })
      .finally(() => setChecking(false));
  }, []);

  // El QR y los enlaces llevan el código después de «#» (no viaja al servidor).
  useEffect(() => {
    let alive = true;
    fetchPrescriptionsConfig().then((config) => {
      if (!alive) return;
      setEnabled(config.enabled);
      const fromLink = normalizePrescriptionCode(window.location.hash);
      if (config.enabled && fromLink) {
        setCode(fromLink);
        void verify(fromLink);
      }
    });
    return () => {
      alive = false;
    };
  }, [verify]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePrescriptionCode(code);
    if (!normalized) {
      setResult(null);
      setError('El código tiene 12 letras y números, por ejemplo K7Q4-M9TX-P3WD.');
      return;
    }
    window.history.replaceState(null, '', `#${normalized}`);
    void verify(normalized);
  };

  const claim = async () => {
    const normalized = normalizePrescriptionCode(code);
    if (!normalized) return;
    setClaiming(true);
    setClaimNotice(null);
    try {
      const saved = await api.post<{ id: string; alreadySaved: boolean }>('/prescriptions/claim', { code: normalized });
      setClaimNotice(saved.alreadySaved ? 'Ya estaba en «Mis récipes».' : 'Listo: lo guardamos en «Mis récipes».');
    } catch (e) {
      setClaimNotice(e instanceof ApiError ? e.message : 'No se pudo guardar el récipe');
    } finally {
      setClaiming(false);
    }
  };

  if (enabled === null) return <PageSpinner />;

  return (
    <div className="container-page max-w-4xl space-y-6 py-10">
      <div>
        <h1 className="text-3xl">Verificar un récipe</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-600">{PRESCRIPTION_VERIFY_NOTICE}</p>
      </div>

      {!enabled ? (
        <Alert tone="info">La verificación de récipes digitales aún no está disponible.</Alert>
      ) : (
        <>
          <form onSubmit={submit} className="card flex flex-wrap items-end gap-2 p-5">
            <div className="w-full sm:w-72">
              <Input
                label="Código del récipe"
                placeholder="K7Q4-M9TX-P3WD"
                autoComplete="off"
                autoCapitalize="characters"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                hint="Está al pie del récipe, junto al código QR."
              />
            </div>
            <Button type="submit" loading={checking}>
              Verificar
            </Button>
          </form>

          {error && <Alert tone="error">{error}</Alert>}

          {result && (
            <div className="space-y-6">
              <Alert tone={result.status === 'VALID' && result.intact ? 'success' : 'warning'} title={`Récipe N° ${result.numberLabel}: ${PRESCRIPTION_STATUS[result.status].label}`}>
                {result.intact ? STATUS_TEXT[result.status] : 'Su contenido no coincide con el que se emitió: no lo aceptes y consulta al médico.'}
                {result.doctorSlug && (
                  <>
                    {' '}
                    <Link href={`/medicos/${result.doctorSlug}`} className="underline">
                      Ver la ficha del médico
                    </Link>
                    .
                  </>
                )}
              </Alert>
              <PrescriptionShare view={result} downloadPdf={() => apiBlob('/prescriptions/verify/pdf', { method: 'POST', body: { code: result.code } })} />
              {user?.role === 'USER' && result.status !== 'ANNULLED' && (
                <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
                  <p className="text-sm text-ink-700">¿Es tuyo? Guárdalo en tu cuenta para tenerlo siempre a mano.</p>
                  <Button variant="outline" onClick={() => void claim()} loading={claiming}>
                    Guardar en mis récipes
                  </Button>
                  {claimNotice && (
                    <p role="status" className="w-full text-sm text-ink-700">
                      {claimNotice}
                    </p>
                  )}
                </div>
              )}
              <PrescriptionPaper view={result} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
