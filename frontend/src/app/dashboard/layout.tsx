'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useReviewsEnabled } from '@/lib/use-reviews';

const LINKS: { href: string; label: string; reviews?: boolean }[] = [
  { href: '/dashboard', label: 'Resumen' },
  { href: '/dashboard/perfil', label: 'Mi perfil' },
  { href: '/dashboard/agenda', label: 'Agenda y citas' },
  { href: '/dashboard/pacientes', label: 'Pacientes' },
  { href: '/dashboard/valoraciones', label: 'Valoraciones', reviews: true },
  { href: '/dashboard/estadisticas', label: 'Estadísticas' },
  { href: '/dashboard/documentos', label: 'Documentos' },
  { href: '/dashboard/pagos', label: 'Suscripción y pagos' },
  { href: '/dashboard/publicaciones', label: 'Publicaciones' },
  { href: '/dashboard/mensajes', label: 'Mensajes' },
  { href: '/dashboard/notificaciones', label: 'Notificaciones' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // «Valoraciones» solo aparece cuando están encendidas en la API.
  const reviewsEnabled = useReviewsEnabled();
  return (
    <RequireAuth roles={['PROFESSIONAL']}>
      <DashboardShell title="Panel del médico" links={LINKS.filter((link) => !link.reviews || reviewsEnabled)}>
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
