'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';

export default function ConfirmarBoletinPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ConfirmarContent />
    </Suspense>
  );
}

function ConfirmarContent() {
  const token = useSearchParams().get('token');
  const [result, setResult] = useState<{ status: 'loading' | 'success' | 'error'; message: string }>({
    status: 'loading',
    message: '',
  });
  const { status, message } = token ? result : { status: 'error' as const, message: 'Falta el enlace de confirmación.' };

  useEffect(() => {
    if (!token) return;
    api
      .post('/newsletter/confirm', { token })
      .then(() => setResult({ status: 'success', message: '¡Listo! Tu suscripción al boletín quedó confirmada.' }))
      .catch((e) =>
        setResult({ status: 'error', message: e instanceof ApiError ? e.message : 'No se pudo confirmar la suscripción.' }),
      );
  }, [token]);

  if (status === 'loading') return <PageSpinner />;

  return (
    <div className="container-page flex min-h-[60vh] max-w-md flex-col justify-center py-12 text-center">
      <Alert tone={status === 'success' ? 'success' : 'error'}>{message}</Alert>
      <Link href="/" className="mt-6">
        <Button className="w-full">Ir al inicio</Button>
      </Link>
    </div>
  );
}
