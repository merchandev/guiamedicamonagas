// Qué versión del sitio está en marcha: el commit y la fecha con que se
// construyó la imagen (deploy.sh los pasa al build). Sirve para comprobar
// desde fuera que producción corre lo último publicado; deploy.sh lo exige.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    {
      service: 'Guia Medica Monagas web',
      version: (process.env.GMM_BUILD_SHA || 'dev').slice(0, 12),
      builtAt: process.env.GMM_BUILT_AT || null,
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );
}
