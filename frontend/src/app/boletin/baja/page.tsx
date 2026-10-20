'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';

export default function BajaBoletinPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <BajaContent />
    </Suspense>
  );
}

function BajaContent() {
  const token = useSearchParams().get('token');
  const [result, setResult] = useState<{ status: 'loading' | 'success' | 'error'; message: string }>({
    status: 'loading',
    message: '',
  });
  const { status, message } = token ? result : { status: 'error' as const, message: 'Falta el enlace de baja.' };

  useEffect(() => {
    if (!token) return;
    api
      .post('/newsletter/unsubscribe', { token })
      .then(() => setResult({ status: 'success', message: 'Listo, ya no recibirás más boletines. Puedes volver a suscribirte cuando quieras.' }))
      .catch((e) =>
        setResult({ status: 'error', message: e instanceof ApiError ? e.message : 'No se pudo procesar la baja.' }),
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
