import type { Metadata } from 'next';

// Formulario de reserva (con sesión): no se ofrece a buscadores.
export const metadata: Metadata = {
  title: 'Agendar cita',
  robots: { index: false, follow: false },
};

export default function AgendarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
