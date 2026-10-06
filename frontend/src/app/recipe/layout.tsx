import type { Metadata } from 'next';

// El récipe lleva datos de salud: nunca en buscadores (además de esta etiqueta,
// el servidor envía X-Robots-Tag en /recipe, ver next.config.js). El código va
// después de «#», así que no llega al servidor ni queda en sus registros.
export const metadata: Metadata = {
  title: 'Verificar récipe',
  description: 'Comprueba con su código que un récipe es auténtico y está vigente.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function RecipeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
