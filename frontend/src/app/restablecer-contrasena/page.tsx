'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';

const schema = z
  .object({
    newPassword: z
      .string()
      .min(10, 'Al menos 10 caracteres')
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Debe incluir letras y números'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Las contraseñas no coinciden', path: ['confirmPassword'] });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, newPassword: values.newPassword });
      router.push('/iniciar-sesion');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo restablecer la contraseña');
    }
  };

  return (
    <div className="container-page flex min-h-[60vh] max-w-md flex-col justify-center py-12">
      <h1 className="text-2xl">Restablecer contraseña</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="card mt-6 space-y-4 p-6">
        {error && <Alert tone="error">{error}</Alert>}
        <Input
          label="Nueva contraseña"
          type="password"
          required
          hint="Mínimo 10 caracteres, con letras y números"
          {...register('newPassword')}
          error={errors.newPassword?.message}
        />
        <Input
          label="Confirmar contraseña"
          type="password"
          required
          {...register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Cambiar contraseña
        </Button>
      </form>
    </div>
  );
}
