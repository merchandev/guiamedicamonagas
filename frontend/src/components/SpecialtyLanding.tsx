import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/server-fetch';
import type { PaginatedResult, ProfessionalListItem, Specialty } from '@/lib/types';
import { DoctorCard } from '@/components/DoctorCard';

export interface LandingPage {
  specialtySlug: string;
  specialtyName: string;
  municipalitySlug: string;
  municipalityName: string;
  count: number;
}

interface MunicipalityRef {
  slug: string;
  name: string;
}

export async function loadLanding(specialtySlug: string, municipalitySlug?: string) {
  const [specialties, municipalities] = await Promise.all([
    serverGet<Specialty[]>('/specialties', 3600),
    serverGet<MunicipalityRef[]>('/geo/municipalities', 3600),
  ]);
  const specialty = specialties?.find((s) => s.slug === specialtySlug);
  const municipality = municipalitySlug ? municipalities?.find((m) => m.slug === municipalitySlug) : undefined;
  return { specialty, municipality };
}

/**
 * Página de aterrizaje «especialidad [+ municipio]». Si no hay médicos
 * publicados que cumplan el filtro responde 404: no se generan páginas vacías.
 */
export async function SpecialtyLanding({ specialtySlug, municipalitySlug }: { specialtySlug: string; municipalitySlug?: string }) {
  const { specialty, municipality } = await loadLanding(specialtySlug, municipalitySlug);
  if (!specialty || (municipalitySlug && !municipality)) notFound();

  const params = new URLSearchParams({ specialty: specialty.slug, limit: '48' });
  if (municipality) params.set('municipality', municipality.name);
  const [result, landings] = await Promise.all([
    serverGet<PaginatedResult<ProfessionalListItem>>(`/professionals?${params.toString()}`),
    serverGet<LandingPage[]>('/professionals/landing-pages', 3600),
  ]);
  if (!result || result.items.length === 0) notFound();

  const otherMunicipalities = (landings ?? []).filter(
    (l) => l.specialtySlug === specialty.slug && l.municipalitySlug !== municipality?.slug,
  );
  const place = municipality ? `${municipality.name}, Monagas` : 'Monagas';

  return (
    <div className="container-page py-10">
      <nav className="text-sm text-ink-500">
        <Link href="/especialidades" className="hover:underline">
          Especialidades
        </Link>
        {' / '}
        {municipality ? (
          <Link href={`/especialidades/${specialty.slug}`} className="hover:underline">
            {specialty.name}
          </Link>
        ) : (
          <span>{specialty.name}</span>
        )}
        {municipality && <> / {municipality.name}</>}
      </nav>
      <h1 className="mt-2 text-3xl">
        {specialty.name} en {place}
      </h1>
      <p className="mt-2 max-w-3xl text-ink-600">
        {result.total} {result.total === 1 ? 'profesional verificado' : 'profesionales verificados'} de {specialty.name.toLowerCase()} en{' '}
        {place}. Cada perfil pasó la verificación de credenciales (título, registro MPPS y Colegio de Médicos) de Guía Médica
        Monagas.
        {specialty.description ? ` ${specialty.description}` : ''}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.items.map((doctor) => (
          <DoctorCard key={doctor.id} doctor={doctor} />
        ))}
      </div>
      {result.total > result.items.length && (
        <p className="mt-6 text-sm">
          <Link
            href={`/medicos?especialidad=${specialty.slug}${municipality ? `&municipio=${encodeURIComponent(municipality.name)}` : ''}`}
            className="text-pine-700 underline"
          >
            Ver los {result.total} profesionales en el directorio
          </Link>
        </p>
      )}

      {otherMunicipalities.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink-900">
            {specialty.name} en otros municipios de Monagas
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {otherMunicipalities.map((l) => (
              <Link
                key={l.municipalitySlug}
                href={`/especialidades/${specialty.slug}/${l.municipalitySlug}`}
                className="rounded-full bg-ink-50 px-3 py-1 text-sm text-ink-700 hover:bg-ink-100"
              >
                {l.municipalityName} ({l.count})
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
