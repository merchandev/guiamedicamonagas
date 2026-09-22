import type { MetadataRoute } from 'next';
import { serverGet } from '@/lib/server-fetch';
import { ProfessionalListItem, PaginatedResult, Specialty } from '@/lib/types';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/medicos`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${siteUrl}/especialidades`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/farmacias`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/terminos-y-condiciones`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/privacidad`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const specialties = (await serverGet<Specialty[]>('/specialties')) ?? [];
  const specialtyRoutes: MetadataRoute.Sitemap = specialties.map((s) => ({
    url: `${siteUrl}/medicos?especialidad=${s.slug}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const doctors = await serverGet<PaginatedResult<ProfessionalListItem>>('/professionals?limit=48');
  const doctorRoutes: MetadataRoute.Sitemap = (doctors?.items ?? []).map((d) => ({
    url: `${siteUrl}/medicos/${d.slug}`,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...specialtyRoutes, ...doctorRoutes];
}
