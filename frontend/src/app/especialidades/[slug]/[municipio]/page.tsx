import type { Metadata } from 'next';
import { loadLanding, SpecialtyLanding } from '@/components/SpecialtyLanding';

type Params = { params: Promise<{ slug: string; municipio: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, municipio } = await params;
  const { specialty, municipality } = await loadLanding(slug, municipio);
  if (!specialty || !municipality) return { title: 'Página no encontrada' };
  return {
    title: `${specialty.name} en ${municipality.name}, Monagas — médicos verificados`,
    description: `Médicos de ${specialty.name.toLowerCase()} verificados en ${municipality.name}, estado Monagas: perfiles, dirección, WhatsApp y citas en línea.`,
    alternates: { canonical: `/especialidades/${specialty.slug}/${municipality.slug}` },
  };
}

export default async function SpecialtyMunicipalityPage({ params }: Params) {
  const { slug, municipio } = await params;
  return <SpecialtyLanding specialtySlug={slug} municipalitySlug={municipio} />;
}
