'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { homePathFor, useAuth } from '@/lib/auth-context';
import { RequireAuth } from '@/components/RequireAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Escribe tu contraseña actual'),
    newPassword: z
      .string()
      .min(10, 'Al menos 10 caracteres')
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Debe incluir letras y números'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Las contraseñas no coinciden', path: ['confirmPassword'] })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['newPassword'],
  });

type FormValues = z.infer<typeof schema>;

export default function AccountSecurityPage() {
  return (
    <RequireAuth>
      <AccountSecurity />
    </RequireAuth>
  );
}

function AccountSecurity() {
  const router = useRouter();
  const { user, changePassword, logoutAll } = useAuth();
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setPasswordError(null);
    setPasswordChanged(false);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      reset();
      setPasswordChanged(true);
    } catch (e) {
      setPasswordError(e instanceof ApiError ? e.message : 'No se pudo cambiar la contraseña');
    }
  };

  const onLogoutAll = async () => {
    setLoggingOutAll(true);
    setLogoutAllError(null);
    try {
      await logoutAll();
      router.push('/iniciar-sesion');
    } catch (e) {
      setLogoutAllError(e instanceof ApiError ? e.message : 'No se pudieron cerrar las sesiones');
      setLoggingOutAll(false);
    }
  };

  return (
    <div className="container-page max-w-2xl space-y-6 py-10">
      <div>
        <Link href={user ? homePathFor(user.role) : '/'} className="text-sm text-pine-700 hover:underline">
          ← Volver a mi panel
        </Link>
        <h1 className="mt-2 text-2xl">Seguridad de la cuenta</h1>
        <p className="mt-1 text-sm text-ink-600">{user?.email}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Cambiar contraseña</h2>
          <p className="mt-1 text-sm text-ink-600">
            Al cambiarla cerramos tu sesión en los demás dispositivos; en este sigues conectado.
          </p>
        </div>
        {passwordError && <Alert tone="error">{passwordError}</Alert>}
        {passwordChanged && <Alert tone="success">Contraseña actualizada. Cerramos tus otras sesiones.</Alert>}
        <Input
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          required
          {...register('currentPassword')}
          error={errors.currentPassword?.message}
        />
        <Input
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          required
          hint="Mínimo 10 caracteres, con letras y números"
          {...register('newPassword')}
          error={errors.newPassword?.message}
        />
        <Input
          label="Confirmar nueva contraseña"
          type="password"
          autoComplete="new-password"
          required
          {...register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={isSubmitting}>
            Cambiar contraseña
          </Button>
        </div>
      </form>

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Sesiones abiertas</h2>
          <p className="mt-1 text-sm text-ink-600">
            Si iniciaste sesión en un equipo que no es tuyo, o crees que alguien más entró a tu cuenta, cierra todas las
            sesiones. Se cierran de inmediato, incluida esta.
          </p>
        </div>
        {logoutAllError && <Alert tone="error">{logoutAllError}</Alert>}
        {confirmingLogoutAll ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-sm text-ink-700">¿Cerrar sesión en todos tus dispositivos?</span>
            <Button variant="outline" onClick={() => setConfirmingLogoutAll(false)} disabled={loggingOutAll}>
              Cancelar
            </Button>
            <Button variant="danger" loading={loggingOutAll} onClick={onLogoutAll}>
              Sí, cerrar todas
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setConfirmingLogoutAll(true)}>
              Cerrar sesión en todos los dispositivos
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
