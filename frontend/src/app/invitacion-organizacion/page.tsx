'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ORG_MEMBER_ROLE_LABELS, ORGANIZATION_TYPE_LABELS } from '@/lib/labels';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';

interface InvitationPreview {
  organizationName: string;
  organizationType: 'PHARMACY' | 'LABORATORY' | 'CLINIC';
  role: 'OWNER' | 'ADMIN' | 'EDITOR';
  email: string;
  expiresAt: string;
  accountExists: boolean;
}

export default function OrganizationInvitationPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <InvitationContent />
    </Suspense>
  );
}

function InvitationContent() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { user, loading, refreshMe } = useAuth();
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('El enlace de invitación está incompleto');
      return;
    }
    api
      .get<InvitationPreview>(`/organizations/invitations/preview?token=${encodeURIComponent(token)}`)
      .then(setInvitation)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'La invitación no es válida'));
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      await api.post('/organizations/invitations/accept', { token });
      await refreshMe();
      router.push('/organizacion');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo aceptar la invitación');
      setAccepting(false);
    }
  };

  const here = `/invitacion-organizacion?token=${encodeURIComponent(token)}`;

  return (
    <div className="container-page flex min-h-[60vh] max-w-lg flex-col justify-center py-12">
      <h1 className="text-2xl">Invitación a un equipo</h1>
      {error && (
        <Alert tone="error" className="mt-6">
          {error}
        </Alert>
      )}
      {!invitation || loading ? (
        !error && <PageSpinner />
      ) : (
        <div className="card mt-6 space-y-4 p-6">
          <p className="text-ink-700">
            Te invitaron a <strong>{invitation.organizationName}</strong> (
            {ORGANIZATION_TYPE_LABELS[invitation.organizationType].toLowerCase()}) como{' '}
            <strong>{ORG_MEMBER_ROLE_LABELS[invitation.role].toLowerCase()}</strong>.
          </p>
          <p className="text-sm text-ink-500">
            Solo la cuenta con el correo invitado ({invitation.email}) puede aceptarla.
            <br />
            Vence: {new Date(invitation.expiresAt).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}
          </p>
          {user ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-600">
                Sesión iniciada como <strong>{user.email}</strong>.
              </p>
              <Button onClick={accept} loading={accepting} className="w-full">
                Aceptar y unirme al equipo
              </Button>
            </div>
          ) : invitation.accountExists ? (
            <Link
              href={`/iniciar-sesion?next=${encodeURIComponent(here)}`}
              className="block w-full rounded-lg bg-pine-700 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-pine-800"
            >
              Iniciar sesión para aceptar
            </Link>
          ) : (
            <div className="space-y-2">
              <Link
                href={`/registro?invitacion=${encodeURIComponent(token)}`}
                className="block w-full rounded-lg bg-pine-700 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-pine-800"
              >
                Crear mi cuenta y unirme
              </Link>
              <Link
                href={`/iniciar-sesion?next=${encodeURIComponent(here)}`}
                className="block text-center text-sm text-pine-700 hover:underline"
              >
                Ya tengo una cuenta con ese correo
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
