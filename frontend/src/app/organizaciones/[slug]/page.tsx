import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/server-fetch';
import type { Organization } from '@/lib/types';
import { ORGANIZATION_TYPE_LABELS } from '@/lib/labels';
import { Badge } from '@/components/ui/Badge';
import { VerificationBadge } from '@/components/VerificationBadge';
import { SocialLinksRow } from '@/components/SocialLinksRow';
import { PhoneButton, WhatsAppButton } from '@/components/ContactButtons';
import { ProfileViewTracker } from '@/components/ProfileViewTracker';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const org = await serverGet<Organization>(`/organizations/${slug}`);
  if (!org) return { title: 'Organización no encontrada' };
  const type = ORGANIZATION_TYPE_LABELS[org.type];
  const municipality = org.locations[0]?.municipality;
  return {
    title: org.seoTitle ?? `${org.name} — ${type}${municipality ? ` en ${municipality}` : ''}, Monagas`,
    description:
      org.seoDescription ??
      org.description ??
      `${type} verificada en ${municipality ?? 'Monagas'}: sedes, horario, servicios y contacto.`,
    alternates: { canonical: `/organizaciones/${org.slug}` },
  };
}

const SCHEMA_TYPE: Record<Organization['type'], string> = {
  PHARMACY: 'Pharmacy',
  LABORATORY: 'MedicalOrganization',
  CLINIC: 'MedicalClinic',
};

function ListBlock({ title, items }: { title: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-ink-50 px-3 py-1 text-sm text-ink-700">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function OrganizationPage({ params }: Params) {
  const { slug } = await params;
  const org = await serverGet<Organization>(`/organizations/${slug}`);
  if (!org) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[org.type],
    name: org.name,
    description: org.description ?? undefined,
    url: `${siteUrl}/organizaciones/${org.slug}`,
    openingHours: org.openingHours ?? undefined,
    address: org.locations.map((l) => ({
      '@type': 'PostalAddress',
      streetAddress: l.address,
      addressLocality: l.municipality ?? undefined,
      addressRegion: 'Monagas',
      addressCountry: 'VE',
    })),
    telephone: org.locations.find((l) => l.phone)?.phone ?? undefined,
  };

  return (
    <div className="container-page max-w-4xl py-10">
      <ProfileViewTracker professionalId={org.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        {org.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt={`Logo de ${org.name}`} className="h-24 w-24 rounded-xl object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-pine-50 text-2xl font-semibold text-pine-800">
            {org.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl">{org.name}</h1>
            <VerificationBadge kind="organization" type={org.type} />
            <Badge tone="neutral">{ORGANIZATION_TYPE_LABELS[org.type]}</Badge>
          </div>
          {org.openingHours && <p className="mt-1 text-sm text-ink-600">Horario: {org.openingHours}</p>}
          {org.description && <p className="mt-2 text-ink-700">{org.description}</p>}
          <SocialLinksRow links={org.socialLinks} resourceId={org.id} className="mt-3" />
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <div className="card space-y-5 p-6">
            <ListBlock title="Servicios" items={org.services} />
            <ListBlock title="Aseguradoras aceptadas" items={org.insurers} />
            <ListBlock title="Métodos de pago" items={org.paymentMethods} />
            {!org.services?.length && !org.insurers?.length && !org.paymentMethods?.length && (
              <p className="text-sm text-ink-500">Esta organización aún no publicó sus servicios.</p>
            )}
          </div>

          {org.professionals && org.professionals.length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-ink-900">Médicos que atienden aquí</h2>
              <ul className="mt-3 divide-y divide-ink-50">
                {org.professionals.map(({ professional }) => (
                  <li key={professional.id} className="py-2">
                    <Link href={`/medicos/${professional.slug}`} className="font-medium text-pine-800 hover:underline">
                      Dr(a). {professional.firstName} {professional.lastName}
                    </Link>
                    {professional.specialties.length > 0 && (
                      <span className="text-sm text-ink-500"> · {professional.specialties.map((s) => s.specialty.name).join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {org.locations.map((loc) => (
            <div key={loc.id} className="card space-y-2 p-5">
              <h3 className="font-semibold text-ink-900">{loc.name}</h3>
              <p className="text-sm text-ink-600">
                {loc.address}
                {loc.municipality ? `, ${loc.municipality}` : ''}
              </p>
              {loc.whatsapp && <WhatsAppButton professionalId={org.id} whatsapp={loc.whatsapp} />}
              {loc.phone && <PhoneButton professionalId={org.id} phone={loc.phone} />}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
