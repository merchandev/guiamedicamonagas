'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
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
      .min(6, 'Al menos 6 caracteres')
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
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const onDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Escribe tu contraseña actual');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.post('/auth/account/deletion', { currentPassword: deletePassword });
      router.push('/iniciar-sesion?eliminada=1');
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : 'No se pudo programar la eliminación');
      setDeleting(false);
    }
  };

  const onResendVerification = async () => {
    setVerificationBusy(true);
    setVerificationMessage(null);
    setVerificationError(null);
    try {
      await api.post('/auth/resend-verification');
      setVerificationMessage('Correo enviado. Revisa tu bandeja de entrada y la carpeta de correo no deseado.');
    } catch (error) {
      setVerificationError(error instanceof ApiError ? error.message : 'No se pudo enviar el correo de verificación.');
    } finally {
      setVerificationBusy(false);
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

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Verificación del correo</h2>
          <p className="mt-1 text-sm text-ink-600">{user?.email}</p>
        </div>
        {user?.isEmailVerified ? (
          <Alert tone="success">Tu correo está verificado.</Alert>
        ) : (
          <>
            <Alert tone="warning">Tu correo aún no está verificado. Usa el enlace que te enviamos para confirmar la cuenta.</Alert>
            {verificationMessage && <Alert tone="success">{verificationMessage}</Alert>}
            {verificationError && <Alert tone="error">{verificationError}</Alert>}
            <div className="flex justify-end">
              <Button type="button" variant="outline" loading={verificationBusy} onClick={() => void onResendVerification()}>
                Reenviar verificación
              </Button>
            </div>
          </>
        )}
      </section>

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
          hint="Mínimo 6 caracteres, con letras y números"
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

      <section className="card space-y-4 border-red-200 p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Eliminar mi cuenta</h2>
          <p className="mt-1 text-sm text-ink-600">
            Al eliminarla cerramos tu sesión y empieza un plazo de 30 días. Si no vuelves a iniciar sesión en ese tiempo,
            borramos tus datos personales de forma definitiva; volver a entrar antes la cancela.{' '}
            <Link href="/eliminar-cuenta" className="text-pine-700 hover:underline">
              Qué se elimina y qué se conserva
            </Link>
            .
          </p>
        </div>
        {deleteError && <Alert tone="error">{deleteError}</Alert>}
        {confirmingDelete ? (
          <div className="space-y-3">
            <Input
              label="Contraseña actual"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeletePassword('');
                  setDeleteError(null);
                }}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button variant="danger" loading={deleting} onClick={onDeleteAccount}>
                Sí, eliminar mi cuenta
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              Eliminar mi cuenta
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
