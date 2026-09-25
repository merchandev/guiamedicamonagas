import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/server-fetch';
import { ProfessionalDetail } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { ContactForm } from '@/components/ContactForm';
import { WhatsAppButton, PhoneButton } from '@/components/ContactButtons';
import { ProfileViewTracker } from '@/components/ProfileViewTracker';
import { VerificationBadge } from '@/components/VerificationBadge';
import { SocialLinksRow } from '@/components/SocialLinksRow';
import { DoctorSeoInput, SITE_NAME, doctorSeoDescription, doctorSeoTitle } from '@/lib/seo';

async function getDoctor(slug: string) {
  return serverGet<ProfessionalDetail>(`/professionals/${slug}`, 30);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doctor = await getDoctor(slug);
  if (!doctor) return { title: 'Médico no encontrado' };

  // SEO automático con lo que el médico cargó (ver lib/seo.ts). La imagen para
  // redes (WhatsApp, Telegram, Facebook, X) la genera opengraph-image.tsx con
  // su foto: una URL estable, no la firmada que vence en una hora.
  const seo = seoInput(doctor);
  const title = doctorSeoTitle(seo);
  const description = doctorSeoDescription(seo);
  const url = `/medicos/${doctor.slug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: doctor.noIndex ? { index: false, follow: false } : undefined,
    openGraph: { type: 'profile', title, description, url, siteName: SITE_NAME, locale: 'es_VE' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

function seoInput(doctor: ProfessionalDetail): DoctorSeoInput {
  return {
    firstName: doctor.firstName,
    lastName: doctor.lastName,
    specialties: doctor.specialties.map((s) => s.specialty.name),
    municipality: doctor.municipality,
    summary: doctor.seoDescription,
    // La API ya oculta la biografía si el plan no la muestra en público.
    bio: doctor.bio,
    bookingEnabled: doctor.bookingEnabled,
  };
}

export default async function DoctorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doctor = await getDoctor(slug);
  if (!doctor) notFound();

  const fullName = `Dr(a). ${doctor.firstName} ${doctor.lastName}`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const profileUrl = `${siteUrl}/medicos/${doctor.slug}`;
  // El enlace corto con el código no cambia aunque cambie el slug.
  const shareUrl = doctor.publicCode ? `${siteUrl}/m/${doctor.publicCode}` : profileUrl;
  const whatsappShare = `https://wa.me/?text=${encodeURIComponent(`${fullName} en Guía Médica Monagas: ${shareUrl}`)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Physician',
    name: fullName,
    url: profileUrl,
    image: `${profileUrl}/opengraph-image`,
    description: doctorSeoDescription(seoInput(doctor)),
    identifier: doctor.publicCode ?? undefined,
    medicalSpecialty: doctor.specialties.map((s) => s.specialty.name),
    address: doctor.address
      ? { '@type': 'PostalAddress', streetAddress: doctor.address, addressRegion: 'Monagas', addressCountry: 'VE' }
      : undefined,
    telephone: doctor.phone ?? undefined,
    sameAs: doctor.socialLinks.map((l) => l.url),
  };

  return (
    <div className="container-page max-w-4xl py-10">
      <ProfileViewTracker professionalId={doctor.id} />
      {/* JSON.stringify output is escaped before injection: a bio/name containing
          "</script>" could otherwise break out of the script tag (JSON-LD XSS). */}
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <div className="card p-8">
        <div className="mb-8 flex flex-col items-start gap-6 sm:flex-row">
          {doctor.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doctor.photoUrl} alt={fullName} className="h-28 w-28 flex-shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-full bg-pine-100 text-3xl font-semibold text-pine-800">
              {doctor.firstName[0]}
              {doctor.lastName[0]}
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl text-ink-950">{fullName}</h1>
              <VerificationBadge kind="doctor" tier={doctor.planTier} verified={doctor.verificationStatus === 'VERIFIED'} />
              {doctor.isFeatured && <Badge tone="gold">Destacado</Badge>}
            </div>
            <p className="mt-1 text-pine-700">
              {doctor.specialties.map((s) => s.specialty.name).join(', ') || 'Medicina General'}
            </p>
            {doctor.publicCode && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-ink-500">
                  Código del médico:{' '}
                  <span className="select-all font-mono font-semibold tracking-wider text-ink-800">{doctor.publicCode}</span>
                </span>
                <a
                  href={whatsappShare}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-pine-700 hover:underline"
                >
                  Compartir por WhatsApp
                </a>
              </div>
            )}
            {doctor.bio && <p className="mt-3 leading-relaxed text-ink-600">{doctor.bio}</p>}
            <SocialLinksRow links={doctor.socialLinks} resourceId={doctor.id} className="mt-3" />
          </div>
        </div>

        <div className="mb-8 rounded-xl border border-pine-100 bg-pine-50/60 p-6">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-pine-900">
            Transparencia médica y legal
          </h2>
          <p className="mb-4 text-sm text-pine-800">
            {doctor.verificationStatus === 'VERIFIED'
              ? 'Credenciales verificadas por Guía Médica Monagas contra los documentos presentados. La verificación es la misma para todos los planes.'
              : 'Verificación en curso: un administrador ya aprobó parte de sus documentos y revisa el resto. El sello de verificado se otorga con todos aprobados.'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {doctor.registrations && doctor.registrations.length > 0 ? (
              doctor.registrations.map((reg) => (
                <div key={`${reg.type}-${reg.issuer}`} className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    {reg.issuer}
                    {reg.jurisdiction && reg.jurisdiction !== 'Nacional' && !reg.issuer.includes(reg.jurisdiction)
                      ? ` · ${reg.jurisdiction}`
                      : ''}
                  </p>
                  <p className="text-lg font-bold text-ink-900">{reg.number}</p>
                  {reg.verifiedAt && <p className="text-xs text-pine-700">Verificado</p>}
                </div>
              ))
            ) : (
              <>
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">N° MPPS</p>
                  <p className="text-lg font-bold text-ink-900">{doctor.mppsNumber || 'No especificado'}</p>
                </div>
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Colegio de Médicos</p>
                  <p className="text-lg font-bold text-ink-900">{doctor.colmedMonagasNumber || 'No especificado'}</p>
                </div>
              </>
            )}
          </div>
          {doctor.organizations && doctor.organizations.length > 0 && (
            <p className="mt-4 text-sm text-pine-900">
              Atiende en:{' '}
              {doctor.organizations.map(({ organization }, index) => (
                <span key={organization.slug}>
                  {index > 0 && ', '}
                  <Link href={`/organizaciones/${organization.slug}`} className="font-medium underline">
                    {organization.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-3 font-semibold text-ink-900">Contacto</h3>
            <div className="space-y-2">
              {doctor.bookingEnabled && (
                <Link
                  href={`/medicos/${doctor.slug}/agendar`}
                  className="flex items-center justify-center gap-2 rounded-lg bg-pine-700 px-4 py-3 text-sm font-semibold text-white hover:bg-pine-800"
                >
                  Agendar cita
                </Link>
              )}
              {doctor.whatsapp && <WhatsAppButton professionalId={doctor.id} whatsapp={doctor.whatsapp} />}
              {doctor.phone && <PhoneButton professionalId={doctor.id} phone={doctor.phone} />}
            </div>
            {doctor.address && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-ink-900">Dirección de consulta</h4>
                <p className="text-sm text-ink-600">{doctor.address}</p>
                {doctor.municipality && <p className="text-sm text-ink-500">{doctor.municipality}, Monagas</p>}
                {doctor.latitude && doctor.longitude && (
                  <iframe
                    title="Mapa del consultorio"
                    className="mt-3 h-48 w-full rounded-lg border border-ink-100"
                    src={`https://www.google.com/maps?q=${doctor.latitude},${doctor.longitude}&output=embed`}
                    loading="lazy"
                  />
                )}
              </div>
            )}

            {doctor.locations.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-ink-900">Otras sedes</h4>
                <ul className="mt-2 space-y-2">
                  {doctor.locations.map((loc) => (
                    <li key={loc.id} className="rounded-lg border border-ink-100 p-3 text-sm">
                      <p className="font-medium text-ink-800">{loc.name}</p>
                      <p className="text-ink-600">
                        {loc.address}
                        {loc.municipality ? `, ${loc.municipality}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 font-semibold text-ink-900">Enviar un mensaje</h3>
            {doctor.canReceiveMessages ? (
              <ContactForm professionalSlug={doctor.slug} />
            ) : (
              <p className="rounded-lg border border-ink-100 bg-ink-50/60 p-4 text-sm text-ink-500">
                Este profesional aún no habilitó mensajes desde la plataforma. Contáctalo por los medios listados a
                la izquierda.
              </p>
            )}
          </div>
        </div>

        {doctor.posts.length > 0 && (
          <div className="mt-10 border-t border-ink-100 pt-8">
            <h3 className="mb-4 font-semibold text-ink-900">Publicaciones</h3>
            <div className="space-y-4">
              {doctor.posts.map((post) => (
                <article key={post.id} className="rounded-lg border border-ink-100 p-4">
                  <h4 className="font-semibold text-ink-900">{post.title}</h4>
                  <p className="mt-1 text-xs text-ink-400">{new Date(post.createdAt).toLocaleDateString('es-VE')}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">{post.content}</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
