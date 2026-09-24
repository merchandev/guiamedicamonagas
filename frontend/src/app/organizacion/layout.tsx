'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { OrganizationProvider, useOrganization } from '@/components/organization/OrgContext';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';

const LINKS = [
  { href: '/organizacion', label: 'Perfil y sedes' },
  { href: '/organizacion/medicos', label: 'Médicos asociados' },
  { href: '/organizacion/miembros', label: 'Equipo' },
  { href: '/organizacion/plan', label: 'Plan y estadísticas' },
];

function OrgGate({ children }: { children: React.ReactNode }) {
  const { organizations, current, selectOrganization } = useOrganization();
  if (!organizations) return <PageSpinner />;
  if (organizations.length === 0) {
    return (
      <EmptyState
        title="Tu cuenta no pertenece a ninguna organización"
        description="Pide al dueño o a un administrador de la organización que te invite a su equipo con este correo."
      />
    );
  }
  return (
    <div className="space-y-6">
      {organizations.length > 1 && (
        <div className="max-w-sm">
          <Select
            label="Organización"
            value={current?.id ?? organizations[0].id}
            onChange={selectOrganization}
            options={organizations.map((o) => ({ value: o.id, label: o.name }))}
          />
        </div>
      )}
      {current ? children : <PageSpinner />}
    </div>
  );
}

export default function OrganizacionLayout({ children }: { children: React.ReactNode }) {
  return (
    // Cualquier cuenta puede ser miembro de un equipo (invitación): lo que da
    // acceso es la pertenencia, no el tipo de cuenta.
    <RequireAuth>
      <OrganizationProvider>
        <DashboardShell title="Panel de la organización" links={LINKS}>
          <OrgGate>{children}</OrgGate>
        </DashboardShell>
      </OrganizationProvider>
    </RequireAuth>
  );
}
