import type { Metadata } from 'next';
import { PacienteShell } from './PacienteShell';

// Los pacientes nunca aparecen en buscadores: además de esta etiqueta, el
// servidor envía X-Robots-Tag en todo /paciente (ver next.config.js).
export const metadata: Metadata = {
  title: 'Panel del paciente',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function PacienteLayout({ children }: { children: React.ReactNode }) {
  return <PacienteShell>{children}</PacienteShell>;
}
