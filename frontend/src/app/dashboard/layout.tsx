'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';

const LINKS = [
  { href: '/dashboard', label: 'Resumen' },
  { href: '/dashboard/perfil', label: 'Mi perfil' },
  { href: '/dashboard/agenda', label: 'Agenda' },
  { href: '/dashboard/citas', label: 'Citas' },
  { href: '/dashboard/pacientes', label: 'Pacientes' },
  { href: '/dashboard/documentos', label: 'Documentos' },
  { href: '/dashboard/pagos', label: 'Suscripción y pagos' },
  { href: '/dashboard/publicaciones', label: 'Publicaciones' },
  { href: '/dashboard/mensajes', label: 'Mensajes' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth roles={['PROFESSIONAL']}>
      <DashboardShell title="Panel del médico" links={LINKS}>
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
