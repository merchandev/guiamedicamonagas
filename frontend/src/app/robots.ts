import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/admin',
          '/paciente',
          // No un prefijo simple: '/organizacion' bloquearía también '/organizaciones/...'.
          '/organizacion$',
          '/organizacion/',
          '/restablecer-contrasena',
          '/verificar-correo',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
