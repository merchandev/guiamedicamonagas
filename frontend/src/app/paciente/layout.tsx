'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';

const LINKS = [{ href: '/paciente', label: 'Mi perfil' }];

export default function PacienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth roles={['USER']}>
      <DashboardShell title="Panel del paciente" links={LINKS}>
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
