'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useAuth, type Permission } from '@/lib/auth-context';

// Cada sección exige un permiso concreto (el backend lo vuelve a comprobar).
const LINKS: { href: string; label: string; permission: Permission }[] = [
  { href: '/admin', label: 'Resumen', permission: 'VIEW_ADMIN_STATS' },
  { href: '/admin/verificaciones', label: 'Verificaciones', permission: 'VERIFY_PROFESSIONALS' },
  { href: '/admin/identidades', label: 'Identidad de pacientes', permission: 'VERIFY_PATIENT_IDENTITY' },
  { href: '/admin/pagos', label: 'Pagos', permission: 'REVIEW_PAYMENTS' },
  { href: '/admin/medicos', label: 'Médicos', permission: 'VERIFY_PROFESSIONALS' },
  { href: '/admin/organizaciones', label: 'Farmacias y clínicas', permission: 'MANAGE_ORGANIZATIONS' },
  { href: '/admin/especialidades', label: 'Especialidades', permission: 'MANAGE_CATALOG' },
  { href: '/admin/catalogos', label: 'Bancos y geografía', permission: 'MANAGE_CATALOG' },
  { href: '/admin/planes', label: 'Planes y tasa', permission: 'MANAGE_PLANS' },
  { href: '/admin/seo', label: 'SEO', permission: 'MANAGE_SITE' },
  { href: '/admin/cookies', label: 'Cookies', permission: 'MANAGE_SITE' },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  return (
    <DashboardShell title="Panel de administración" links={LINKS.filter((l) => permissions.includes(l.permission))}>
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
