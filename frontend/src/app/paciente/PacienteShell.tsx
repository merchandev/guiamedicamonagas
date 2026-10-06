'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useReviewsEnabled } from '@/lib/use-reviews';
import { usePrescriptionsEnabled } from '@/lib/use-prescriptions';

const LINKS: { href: string; label: string; reviews?: boolean; prescriptions?: boolean }[] = [
  { href: '/paciente', label: 'Mi perfil' },
  { href: '/paciente/codigo', label: 'Mi código' },
  { href: '/paciente/citas', label: 'Mis citas' },
  { href: '/paciente/recipes', label: 'Mis récipes', prescriptions: true },
  { href: '/paciente/valoraciones', label: 'Valoraciones', reviews: true },
  { href: '/paciente/contactos', label: 'Pedidos de contacto' },
  { href: '/paciente/permisos', label: 'Permisos' },
  { href: '/paciente/privacidad', label: 'Privacidad y mis datos' },
  { href: '/paciente/notificaciones', label: 'Notificaciones' },
];

export function PacienteShell({ children }: { children: React.ReactNode }) {
  // «Valoraciones» y «Mis récipes» solo aparecen cuando están encendidos en la API.
  const reviewsEnabled = useReviewsEnabled();
  const prescriptionsEnabled = usePrescriptionsEnabled();
  return (
    <RequireAuth roles={['USER']}>
      <DashboardShell title="Panel del paciente" links={LINKS.filter((link) => (!link.reviews || reviewsEnabled) && (!link.prescriptions || prescriptionsEnabled))}>
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
