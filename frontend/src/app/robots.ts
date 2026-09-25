import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /paciente y /p/ (destino del QR) no se bloquean aquí a propósito: llevan
        // noindex (cabecera X-Robots-Tag y <meta>), y un buscador solo respeta el
        // noindex de una página que puede rastrear.
        disallow: [
          '/dashboard',
          '/admin',
          '/cuenta',
          '/invitacion-organizacion',
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
