// Con el sitio en HTTPS, el navegador sube a https:// cualquier recurso que
// quede enlazado por http:// (sin esto sería contenido mixto). En desarrollo
// (http://localhost) no se envía: rompería la propia carga de la página.
const httpsSite = (process.env.NEXT_PUBLIC_SITE_URL || '').startsWith('https://');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    cpus: Math.max(1, Number.parseInt(process.env.NEXT_BUILD_CPUS || '1', 10) || 1),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          ...(httpsSite ? [{ key: 'Content-Security-Policy', value: 'upgrade-insecure-requests' }] : []),
        ],
      },
    ];
  },
};

module.exports = nextConfig;
