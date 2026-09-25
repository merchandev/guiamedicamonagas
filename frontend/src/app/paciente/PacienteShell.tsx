'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';

const LINKS = [
  { href: '/paciente', label: 'Mi perfil' },
  { href: '/paciente/codigo', label: 'Mi código' },
  { href: '/paciente/citas', label: 'Mis citas' },
  { href: '/paciente/permisos', label: 'Permisos' },
];

export function PacienteShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth roles={['USER']}>
      <DashboardShell title="Panel del paciente" links={LINKS}>
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
