import type { MetadataRoute } from 'next';
import { serverGet } from '@/lib/server-fetch';
import { Organization, Specialty } from '@/lib/types';

interface SitemapPage {
  items: { slug: string; updatedAt: string }[];
  totalPages: number;
}

interface LandingPage {
  specialtySlug: string;
  municipalitySlug: string;
  count: number;
}

// Límite de Google por archivo de sitemap. Al acercarse, dividir con generateSitemaps.
const MAX_URLS = 50_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/medicos`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${siteUrl}/especialidades`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/farmacias`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/planes`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/terminos-y-condiciones`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/privacidad`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const [specialties, landings, organizations] = await Promise.all([
    serverGet<Specialty[]>('/specialties'),
    serverGet<LandingPage[]>('/professionals/landing-pages'),
    serverGet<Organization[]>('/organizations'),
  ]);

  // Solo páginas con contenido real: especialidades con médicos publicados y
  // combinaciones especialidad + municipio que tienen al menos un médico.
  const specialtiesWithDoctors = new Set((landings ?? []).map((l) => l.specialtySlug));
  const specialtyRoutes: MetadataRoute.Sitemap = (specialties ?? [])
    .filter((s) => specialtiesWithDoctors.has(s.slug))
    .map((s) => ({ url: `${siteUrl}/especialidades/${s.slug}`, changeFrequency: 'weekly', priority: 0.6 }));
  const landingRoutes: MetadataRoute.Sitemap = (landings ?? []).map((l) => ({
    url: `${siteUrl}/especialidades/${l.specialtySlug}/${l.municipalitySlug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));
  const organizationRoutes: MetadataRoute.Sitemap = (organizations ?? []).map((o) => ({
    url: `${siteUrl}/organizaciones/${o.slug}`,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  // Todos los médicos publicados, página por página (antes solo los primeros 48).
  const doctorRoutes: MetadataRoute.Sitemap = [];
  for (let page = 1; doctorRoutes.length < MAX_URLS; page++) {
    const batch = await serverGet<SitemapPage>(`/professionals/sitemap?page=${page}`, 3600);
    if (!batch) break;
    for (const d of batch.items) {
      doctorRoutes.push({
        url: `${siteUrl}/medicos/${d.slug}`,
        lastModified: d.updatedAt,
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
    if (page >= batch.totalPages) break;
  }

  return [...staticRoutes, ...specialtyRoutes, ...landingRoutes, ...organizationRoutes, ...doctorRoutes].slice(0, MAX_URLS);
}
