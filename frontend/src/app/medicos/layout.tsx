import type { Metadata } from 'next';

// El directorio es una página de cliente (filtros en la URL): su título,
// descripción y URL canónica van aquí. Con filtros (?especialidad=…) la
// canónica sigue siendo /medicos. La ficha de cada médico define las suyas.
export const metadata: Metadata = {
  title: 'Directorio de médicos',
  description:
    'Médicos y especialistas del estado Monagas con verificación documental. Busca por nombre, especialidad, municipio o código.',
  alternates: { canonical: '/medicos' },
};

export default function MedicosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
