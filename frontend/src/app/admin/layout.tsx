'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useAuth, type Permission } from '@/lib/auth-context';
import { useReviewsEnabled } from '@/lib/use-reviews';

// Cada sección exige un permiso concreto (el backend lo vuelve a comprobar);
// sin permiso, la ven todas las cuentas de administración.
const LINKS: { href: string; label: string; permission?: Permission; reviews?: boolean }[] = [
  { href: '/admin', label: 'Resumen', permission: 'VIEW_ADMIN_STATS' },
  { href: '/admin/verificaciones', label: 'Verificaciones', permission: 'VERIFY_PROFESSIONALS' },
  { href: '/admin/identidades', label: 'Identidad de pacientes', permission: 'VERIFY_PATIENT_IDENTITY' },
  { href: '/admin/pagos', label: 'Pagos', permission: 'REVIEW_PAYMENTS' },
  { href: '/admin/medicos', label: 'Médicos', permission: 'VERIFY_PROFESSIONALS' },
  { href: '/admin/cuentas-medicos', label: 'Cuentas y planes de médicos', permission: 'MANAGE_ACCOUNTS' },
  { href: '/admin/pacientes', label: 'Cuentas de pacientes', permission: 'MANAGE_ACCOUNTS' },
  { href: '/admin/solicitudes', label: 'Solicitudes legales', permission: 'MANAGE_LEGAL_REQUESTS' },
  { href: '/admin/valoraciones', label: 'Valoraciones', permission: 'MODERATE_REVIEWS', reviews: true },
  { href: '/admin/organizaciones', label: 'Farmacias y clínicas', permission: 'MANAGE_ORGANIZATIONS' },
  { href: '/admin/especialidades', label: 'Especialidades', permission: 'MANAGE_CATALOG' },
  { href: '/admin/catalogos', label: 'Bancos y geografía', permission: 'MANAGE_CATALOG' },
  { href: '/admin/planes', label: 'Planes y tasa', permission: 'MANAGE_PLANS' },
  { href: '/admin/seo', label: 'SEO', permission: 'MANAGE_SITE' },
  { href: '/admin/cookies', label: 'Cookies', permission: 'MANAGE_SITE' },
  { href: '/admin/notificaciones', label: 'Notificaciones' },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  // «Valoraciones» solo aparece cuando están encendidas en la API.
  const reviewsEnabled = useReviewsEnabled();
  const links = LINKS.filter((l) => (!l.permission || permissions.includes(l.permission)) && (!l.reviews || reviewsEnabled));
  return (
    <DashboardShell title="Panel de administración" links={links}>
      {children}
    </DashboardShell>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth roles={['ADMIN', 'SUPERADMIN']}>
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}
