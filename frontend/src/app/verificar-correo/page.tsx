'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [result, setResult] = useState<{ status: 'loading' | 'success' | 'error'; message: string }>({
    status: 'loading',
    message: '',
  });
  const { status, message } = token ? result : { status: 'error' as const, message: 'Falta el token de verificación.' };

  useEffect(() => {
    if (!token) return;
    api
      .get<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => setResult({ status: 'success', message: res.message }))
      .catch((e) =>
        setResult({ status: 'error', message: e instanceof ApiError ? e.message : 'No se pudo verificar el correo' }),
      );
  }, [token]);

  if (status === 'loading') return <PageSpinner />;

  return (
    <div className="container-page flex min-h-[60vh] max-w-md flex-col justify-center py-12 text-center">
      <Alert tone={status === 'success' ? 'success' : 'error'}>{message}</Alert>
      <Link href="/iniciar-sesion" className="mt-6">
        <Button className="w-full">Ir a iniciar sesión</Button>
      </Link>
    </div>
  );
}
