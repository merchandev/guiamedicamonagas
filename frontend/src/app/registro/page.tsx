'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth, ApiError, homePathFor } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { ORG_MEMBER_ROLE_LABELS, ORGANIZATION_TYPE_LABELS } from '@/lib/labels';
import { PageSpinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { cn } from '@/lib/cn';
import TermsModal from '@/components/TermsModal';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal';

const CEDULA_REGEX = /^[VEJPGvejpg]-?\d{5,9}$/;
const RIF_REGEX = /^[VEJPGvejpg]-?\d{8,9}-?\d$/;

const ROLE_OPTIONS = [
  { value: 'PROFESSIONAL', label: 'Soy médico' },
  { value: 'USER', label: 'Soy paciente' },
  { value: 'ORGANIZATION', label: 'Farmacia, laboratorio o clínica' },
] as const;

const schema = z
  .object({
    role: z.enum(['USER', 'PROFESSIONAL', 'ORGANIZATION']),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    cedula: z.string().optional(),
    organizationName: z.string().optional(),
    organizationType: z.enum(['PHARMACY', 'LABORATORY', 'CLINIC']).optional(),
    organizationRif: z.string().optional(),
    invitationToken: z.string().optional(),
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
  })
  .refine((data) => data.role !== 'USER' || (data.firstName && data.lastName && data.cedula), {
    message: 'Nombre, apellido y cédula son obligatorios para pacientes',
    path: ['firstName'],
  })
  .refine((data) => data.role !== 'USER' || !data.cedula || CEDULA_REGEX.test(data.cedula), {
    message: 'Cédula inválida (ej. V-12345678)',
    path: ['cedula'],
  })
  .refine((data) => data.role !== 'ORGANIZATION' || !!data.invitationToken || (data.organizationName && data.organizationName.trim().length >= 2), {
    message: 'Indica el nombre de la organización',
    path: ['organizationName'],
  })
  .refine((data) => data.role !== 'ORGANIZATION' || !!data.invitationToken || !!data.organizationType, {
    message: 'Selecciona el tipo',
    path: ['organizationType'],
  })
  .refine((data) => data.role !== 'ORGANIZATION' || !data.organizationRif || RIF_REGEX.test(data.organizationRif), {
    message: 'RIF inválido (ej. J-12345678-9)',
    path: ['organizationRif'],
  });

type FormValues = z.infer<typeof schema>;

interface InvitationPreview {
  organizationName: string;
  organizationType: 'PHARMACY' | 'LABORATORY' | 'CLINIC';
  role: 'OWNER' | 'ADMIN' | 'EDITOR';
  email: string;
  accountExists: boolean;
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const { register: doRegister } = useAuth();
  const router = useRouter();
  // ?invitacion=<token>: alta para unirse al equipo de una organización existente.
  const invitationToken = useSearchParams().get('invitacion');
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: invitationToken ? { role: 'ORGANIZATION', invitationToken } : { role: 'PROFESSIONAL' },
  });

  useEffect(() => {
    if (!invitationToken) return;
    api
      .get<InvitationPreview>(`/organizations/invitations/preview?token=${encodeURIComponent(invitationToken)}`)
      .then(setInvitation)
      .catch((e) => setInvitationError(e instanceof ApiError ? e.message : 'La invitación no es válida'));
  }, [invitationToken]);

  const role = watch('role');
  const organizationType = watch('organizationType');

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
        acceptLegal: true,
        firstName: values.role === 'ORGANIZATION' ? undefined : values.firstName,
        lastName: values.role === 'ORGANIZATION' ? undefined : values.lastName,
        cedula: values.role === 'USER' ? values.cedula : undefined,
        organizationName: values.role === 'ORGANIZATION' ? values.organizationName : undefined,
        organizationType: values.role === 'ORGANIZATION' ? values.organizationType : undefined,
        organizationRif: values.role === 'ORGANIZATION' ? values.organizationRif || undefined : undefined,
        invitationToken: values.invitationToken || undefined,
      });
      if (values.invitationToken) {
        router.push('/organizacion');
        return;
      }
      router.push(user.role === 'PROFESSIONAL' ? '/dashboard/documentos' : homePathFor(user.role));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la cuenta');
    }
  };

  return (
    <div className="container-page flex min-h-[70vh] max-w-xl flex-col justify-center py-12">
      <h1 className="text-2xl">Crear cuenta</h1>
      <p className="mt-1 text-sm text-ink-500">
        Regístrate como paciente, como médico o como farmacia, laboratorio o clínica. La verificación y el perfil básico
        son gratuitos.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="card mt-6 space-y-4 p-6">
        {error && <Alert tone="error">{error}</Alert>}
        {invitationToken && invitationError && <Alert tone="error">{invitationError}</Alert>}
        {invitationToken && invitation && (
          <Alert tone={invitation.accountExists ? 'warning' : 'info'}>
            {invitation.accountExists ? (
              <>
                Ya existe una cuenta con el correo invitado ({invitation.email}).{' '}
                <Link
                  href={`/iniciar-sesion?next=${encodeURIComponent(`/invitacion-organizacion?token=${invitationToken}`)}`}
                  className="font-medium underline"
                >
                  Inicia sesión para aceptar la invitación
                </Link>
                .
              </>
            ) : (
              <>
                Te unirás a <strong>{invitation.organizationName}</strong> (
                {ORGANIZATION_TYPE_LABELS[invitation.organizationType].toLowerCase()}) como{' '}
                <strong>{ORG_MEMBER_ROLE_LABELS[invitation.role].toLowerCase()}</strong>. Usa el correo invitado:{' '}
                {invitation.email}.
              </>
            )}
          </Alert>
        )}

        {!invitationToken && (
        <div className="grid gap-2 sm:grid-cols-3">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-center text-sm font-medium',
                role === option.value ? 'border-pine-700 bg-pine-50 text-pine-800' : 'border-ink-200 text-ink-600',
              )}
            >
              <input type="radio" value={option.value} className="sr-only" {...register('role')} />
              {option.label}
            </label>
          ))}
        </div>
        )}

        {(role === 'PROFESSIONAL' || role === 'USER') && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nombres" required {...register('firstName')} error={errors.firstName?.message} />
            <Input label="Apellidos" required {...register('lastName')} />
          </div>
        )}

        {role === 'USER' && (
          <Input
            label="Cédula de identidad"
            required
            placeholder="V-12345678"
            hint="Se guarda cifrada; ningún médico la ve sin tu autorización."
            {...register('cedula')}
            error={errors.cedula?.message}
          />
        )}

        {role === 'ORGANIZATION' && !invitationToken && (
          <>
            <Input
              label="Nombre de la organización"
              required
              {...register('organizationName')}
              error={errors.organizationName?.message}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Tipo"
                required
                value={organizationType ?? ''}
                onChange={(value) => setValue('organizationType', (value || undefined) as FormValues['organizationType'], { shouldValidate: true })}
                options={[
                  { value: '', label: 'Selecciona' },
                  { value: 'PHARMACY', label: 'Farmacia' },
                  { value: 'LABORATORY', label: 'Laboratorio' },
                  { value: 'CLINIC', label: 'Clínica' },
                ]}
                error={errors.organizationType?.message}
              />
              <Input label="RIF" placeholder="J-12345678-9" {...register('organizationRif')} error={errors.organizationRif?.message} />
            </div>
            <p className="text-xs text-ink-500">
              Tu organización se publica en el directorio cuando un administrador verifique sus datos.
            </p>
          </>
        )}

        <Input label="Correo electrónico" type="email" required {...register('email')} error={errors.email?.message} />
        <div className="grid gap-3 sm:grid-cols-2">
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
        </div>

        <label className="flex items-start gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={() => setTermsAccepted((v) => !v)}
            className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pine-700 focus:ring-pine-600"
          />
          <span>
            He leído y acepto los{' '}
            <button type="button" onClick={() => setShowTerms(true)} className="text-pine-700 underline">
              Términos y condiciones (v{TERMS_VERSION})
            </button>{' '}
            y la{' '}
            <a href="/privacidad" target="_blank" className="text-pine-700 underline">
              Política de privacidad (v{PRIVACY_VERSION})
            </a>
            .
          </span>
        </label>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Crear cuenta
        </Button>
      </form>

      <TermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} onAccept={() => setTermsAccepted(true)} />
    </div>
  );
}
