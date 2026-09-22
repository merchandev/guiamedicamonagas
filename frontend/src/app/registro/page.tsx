'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth, ApiError } from '@/lib/auth-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { cn } from '@/lib/cn';
import TermsModal from '@/components/TermsModal';

const schema = z
  .object({
    role: z.enum(['USER', 'PROFESSIONAL']),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email('Correo inválido'),
    password: z
      .string()
      .min(10, 'Al menos 10 caracteres')
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Debe incluir letras y números'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
  .refine((data) => data.role !== 'PROFESSIONAL' || (data.firstName && data.lastName), {
    message: 'Nombre y apellido son obligatorios para médicos',
    path: ['firstName'],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: doRegister } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { role: 'PROFESSIONAL' } });

  const role = watch('role');

  const onSubmit = async (values: FormValues) => {
    setError(null);
    if (!termsAccepted) {
      setShowTerms(true);
      return;
    }
    try {
      const user = await doRegister({
        email: values.email,
        password: values.password,
        role: values.role,
        firstName: values.firstName,
        lastName: values.lastName,
      });
      router.push(user.role === 'PROFESSIONAL' ? '/dashboard/documentos' : '/dashboard');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la cuenta');
    }
  };

  return (
    <div className="container-page flex min-h-[70vh] max-w-md flex-col justify-center py-12">
      <h1 className="text-2xl">Crear cuenta</h1>
      <p className="mt-1 text-sm text-ink-500">Regístrate como paciente o como médico para aparecer en el directorio.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="card mt-6 space-y-4 p-6">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-2">
          {(['PROFESSIONAL', 'USER'] as const).map((r) => (
            <label
              key={r}
              className={cn(
                'cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium',
                role === r ? 'border-pine-700 bg-pine-50 text-pine-800' : 'border-ink-200 text-ink-600',
              )}
            >
              <input type="radio" value={r} className="sr-only" {...register('role')} />
              {r === 'PROFESSIONAL' ? 'Soy médico' : 'Soy paciente'}
            </label>
          ))}
        </div>

        {role === 'PROFESSIONAL' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombres" required {...register('firstName')} error={errors.firstName?.message} />
            <Input label="Apellidos" required {...register('lastName')} />
          </div>
        )}

        <Input label="Correo electrónico" type="email" required {...register('email')} error={errors.email?.message} />
        <Input
          label="Contraseña"
          type="password"
          required
          hint="Mínimo 10 caracteres, con letras y números"
          {...register('password')}
          error={errors.password?.message}
        />
        <Input
          label="Confirmar contraseña"
          type="password"
          required
          {...register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />

        <label className="flex items-start gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={() => setTermsAccepted((v) => !v)}
            className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pine-700 focus:ring-pine-600"
          />
          He leído y acepto las{' '}
          <button type="button" onClick={() => setShowTerms(true)} className="text-pine-700 underline">
            condiciones de uso
          </button>
        </label>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Crear cuenta
        </Button>
      </form>

      <TermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} onAccept={() => setTermsAccepted(true)} />
    </div>
  );
}
