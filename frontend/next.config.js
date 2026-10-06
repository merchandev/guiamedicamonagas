// Con el sitio en HTTPS, el navegador sube a https:// cualquier recurso que
// quede enlazado por http:// (sin esto sería contenido mixto). En desarrollo
// (http://localhost) no se envía: rompería la propia carga de la página.
const httpsSite = (process.env.NEXT_PUBLIC_SITE_URL || '').startsWith('https://');
const devServer = process.env.NODE_ENV !== 'production';

// Política de seguridad de contenido (CSP): el navegador solo carga lo que
// viene de este dominio, más el video de YouTube (sin cookies, al pulsar), sus
// miniaturas y el mapa de Google del consultorio. Un script inyectado (XSS)
// no puede traer código de otro sitio, enviar datos a otro servidor, abrir el
// sitio dentro de otro (clickjacking) ni cambiar a dónde van los formularios.
// 'unsafe-inline' en scripts es necesario para los scripts en línea de Next.js
// en páginas estáticas e ISR (un nonce exigiría renderizar todo a pedido).
// En producción la API y los archivos van por el mismo dominio (Caddy); en
// desarrollo y en CI viven en otros puertos de localhost.
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || '').origin;
  } catch {
    return ''; // ruta relativa (/api/v1): mismo dominio
  }
})();
const localhost = httpsSite ? '' : ' http://localhost:* http://127.0.0.1:*';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devServer ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://i.ytimg.com${localhost}`,
  "font-src 'self' data:",
  `connect-src 'self'${apiOrigin && !apiOrigin.startsWith('null') ? ` ${apiOrigin}` : ''}${devServer ? ' ws: wss:' : ''}${localhost}`,
  'frame-src https://www.youtube-nocookie.com https://www.google.com https://maps.google.com',
  "media-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(httpsSite ? ['upgrade-insecure-requests'] : []),
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Sin «X-Powered-By: Next.js»: no se anuncia qué software corre el sitio.
  poweredByHeader: false,
  // Las páginas con ISR se regeneran cada minuto. Por defecto Next permite a
  // las cachés intermedias (CDN, proxies, lectores de enlaces) servir una copia
  // vencida hasta un año («stale-while-revalidate»); así, alguien podía seguir
  // viendo una versión vieja del sitio después de un despliegue. Con esto, una
  // copia nunca tiene más de una hora.
  expireTime: 3600,
  experimental: {
    cpus: Math.max(1, Number.parseInt(process.env.NEXT_BUILD_CPUS || '1', 10) || 1),
  },
  async headers() {
    // Pacientes (panel y destino del QR) y áreas privadas: nunca en buscadores.
    // Va como cabecera además de la etiqueta <meta>, y esas rutas NO se bloquean
    // en robots.txt: un buscador que no puede rastrear una página tampoco ve su
    // noindex y podría indexar la URL sola.
    const noIndex = { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' };
    const privatePaths = ['/paciente', '/paciente/:path*', '/p/:path*', '/recipe', '/dashboard/:path*', '/admin/:path*', '/cuenta/:path*'];
    return [
      ...privatePaths.map((source) => ({ source, headers: [noIndex] })),
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          // Aislamiento entre orígenes: otra pestaña o sitio no conserva una
          // referencia a esta ventana ni carga sus recursos desde otro dominio.
          // (Sin Cross-Origin-Embedder-Policy: bloquearía YouTube y el mapa.)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
