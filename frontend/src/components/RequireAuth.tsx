'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, Role } from '@/lib/auth-context';
import { PageSpinner } from '@/components/ui/Spinner';

export function RequireAuth({
  roles,
  children,
}: {
  roles?: Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Vuelve a la misma página tras iniciar sesión (p. ej. el QR de un
      // paciente abre /dashboard/pacientes?codigo=… y el código no se pierde).
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/iniciar-sesion?next=${encodeURIComponent(next)}`);
      return;
    }
    if (roles && !roles.includes(user.role)) {
      router.replace('/');
    }
  }, [loading, user, roles, router]);

  if (loading || !user || (roles && !roles.includes(user.role))) {
    return <PageSpinner />;
  }

  return <>{children}</>;
}
