import type { Metadata } from 'next';
import { loadLanding, SpecialtyLanding } from '@/components/SpecialtyLanding';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { specialty } = await loadLanding(slug);
  if (!specialty) return { title: 'Especialidad no encontrada' };
  return {
    title: `${specialty.name} en Monagas — médicos verificados`,
    description: `Encuentra especialistas en ${specialty.name.toLowerCase()} verificados en el estado Monagas: perfiles, contacto y citas en línea.`,
    alternates: { canonical: `/especialidades/${specialty.slug}` },
  };
}

export default async function SpecialtyPage({ params }: Params) {
  const { slug } = await params;
  return <SpecialtyLanding specialtySlug={slug} />;
}
