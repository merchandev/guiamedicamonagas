'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';

const LINKS = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/verificaciones', label: 'Verificaciones' },
  { href: '/admin/pagos', label: 'Pagos' },
  { href: '/admin/medicos', label: 'Médicos' },
  { href: '/admin/especialidades', label: 'Especialidades' },
  { href: '/admin/organizaciones', label: 'Farmacias y clínicas' },
  { href: '/admin/planes', label: 'Planes y tasa' },
  { href: '/admin/seo', label: 'SEO' },
  { href: '/admin/cookies', label: 'Cookies' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth roles={['ADMIN', 'SUPERADMIN']}>
      <DashboardShell title="Panel de administración" links={LINKS}>
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
