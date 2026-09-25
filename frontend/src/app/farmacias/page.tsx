import Link from 'next/link';
import type { Metadata } from 'next';
import { serverGet } from '@/lib/server-fetch';
import { Organization } from '@/lib/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { VerificationBadge } from '@/components/VerificationBadge';
import { SocialLinksRow } from '@/components/SocialLinksRow';

export const metadata: Metadata = {
  title: 'Farmacias, laboratorios y clínicas',
  description: 'Directorio de farmacias, laboratorios clínicos y clínicas en el estado Monagas.',
};

const TYPE_LABELS: Record<string, string> = {
  PHARMACY: 'Farmacia',
  LABORATORY: 'Laboratorio',
  CLINIC: 'Clínica',
};

const TABS = [
  { value: '', label: 'Todos' },
  { value: 'PHARMACY', label: 'Farmacias' },
  { value: 'LABORATORY', label: 'Laboratorios' },
  { value: 'CLINIC', label: 'Clínicas' },
];

export default async function FarmaciasPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const type = tipo ?? '';
  const query = type ? `?type=${type}` : '';
  const organizations = (await serverGet<Organization[]>(`/organizations${query}`)) ?? [];

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl">Farmacias, laboratorios y clínicas</h1>
      <p className="mt-2 text-ink-600">
        Organizaciones de salud verificadas en Monagas. ¿Administras una?{' '}
        <Link href="/registro?tipo=organizacion" className="text-pine-700 underline">
          Regístrala gratis
        </Link>
        .
      </p>

      <div className="mt-6 flex gap-2 border-b border-ink-100">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value ? `/farmacias?tipo=${tab.value}` : '/farmacias'}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              type === tab.value ? 'border-pine-700 text-pine-800' : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {organizations.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Aún no hay organizaciones registradas en esta categoría" />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <div key={org.id} className="card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-ink-900">
                    <Link href={`/organizaciones/${org.slug}`} className="hover:underline">
                      {org.name}
                    </Link>
                  </h3>
                  <VerificationBadge kind="organization" type={org.type} />
                </div>
                <Badge tone="neutral">{TYPE_LABELS[org.type]}</Badge>
              </div>
              {org.description && <p className="mt-2 text-sm text-ink-600">{org.description}</p>}
              <ul className="mt-3 space-y-1.5">
                {org.locations.map((loc) => (
                  <li key={loc.id} className="text-sm text-ink-500">
                    <span className="font-medium text-ink-700">{loc.name}:</span> {loc.address}
                    {loc.municipality ? `, ${loc.municipality}` : ''}
                  </li>
                ))}
              </ul>
              <SocialLinksRow links={org.socialLinks} resourceId={org.id} className="mt-3" />
              <Link href={`/organizaciones/${org.slug}`} className="mt-3 inline-block text-sm font-medium text-pine-700 hover:underline">
                Ver servicios y sedes →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
