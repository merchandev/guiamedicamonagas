'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useReviewsEnabled } from '@/lib/use-reviews';

const LINKS: { href: string; label: string; reviews?: boolean }[] = [
  { href: '/paciente', label: 'Mi perfil' },
  { href: '/paciente/codigo', label: 'Mi código' },
  { href: '/paciente/citas', label: 'Mis citas' },
  { href: '/paciente/valoraciones', label: 'Valoraciones', reviews: true },
  { href: '/paciente/contactos', label: 'Pedidos de contacto' },
  { href: '/paciente/permisos', label: 'Permisos' },
  { href: '/paciente/privacidad', label: 'Privacidad y mis datos' },
  { href: '/paciente/notificaciones', label: 'Notificaciones' },
];

export function PacienteShell({ children }: { children: React.ReactNode }) {
  // «Valoraciones» solo aparece cuando están encendidas en la API.
  const reviewsEnabled = useReviewsEnabled();
  return (
    <RequireAuth roles={['USER']}>
      <DashboardShell title="Panel del paciente" links={LINKS.filter((link) => !link.reviews || reviewsEnabled)}>
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
