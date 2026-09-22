'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth, ApiError } from '@/lib/auth-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const schema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const user = await login(values.email, values.password);
      router.push(user.role === 'ADMIN' || user.role === 'SUPERADMIN' ? '/admin' : '/dashboard');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo iniciar sesión');
    }
  };

  return (
    <div className="container-page flex min-h-[70vh] max-w-md flex-col justify-center py-12">
      <h1 className="text-2xl">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-ink-500">Accede a tu panel de paciente, médico o administrador.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="card mt-6 space-y-4 p-6">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Correo electrónico" type="email" required {...register('email')} error={errors.email?.message} />
        <Input label="Contraseña" type="password" required {...register('password')} error={errors.password?.message} />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Entrar
        </Button>
        <div className="flex justify-between text-sm">
          <Link href="/olvide-contrasena" className="text-pine-700 hover:underline">
            Olvidé mi contraseña
          </Link>
          <Link href="/registro" className="text-pine-700 hover:underline">
            Crear cuenta
          </Link>
        </div>
      </form>
    </div>
  );
}
