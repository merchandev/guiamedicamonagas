'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const schema = z.object({ email: z.string().email('Correo inválido') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    await api.post('/auth/forgot-password', values).catch(() => undefined);
    setSent(true);
  };

  return (
    <div className="container-page flex min-h-[60vh] max-w-md flex-col justify-center py-12">
      <h1 className="text-2xl">Recuperar contraseña</h1>
      <p className="mt-1 text-sm text-ink-500">Te enviaremos un enlace para restablecerla.</p>

      {sent ? (
        <Alert tone="success" className="mt-6">
          Si el correo existe en nuestro sistema, te enviamos instrucciones para restablecer tu contraseña.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="card mt-6 space-y-4 p-6">
          <Input label="Correo electrónico" type="email" required {...register('email')} error={errors.email?.message} />
          <Button type="submit" loading={isSubmitting} className="w-full">
            Enviar enlace
          </Button>
        </form>
      )}
    </div>
  );
}
