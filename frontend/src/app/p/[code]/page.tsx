import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheckIcon, LockIcon } from '@/components/icons';

// Destino del QR del paciente. No consulta la API ni muestra ningún dato:
// solo lleva al médico a registrar el código desde su panel (que exige su
// sesión). Nunca se indexa (además, X-Robots-Tag en next.config.js).
export const metadata: Metadata = {
  title: 'Código de paciente',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

const CODE_PATTERN = /^[A-Za-z2-9]{4}-?[A-Za-z2-9]{4}-?[A-Za-z2-9]{4}$/;

export default async function PatientCodeLanding({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).trim();
  const valid = CODE_PATTERN.test(code);
  const registerHref = `/dashboard/pacientes?codigo=${encodeURIComponent(code.toUpperCase())}`;

  return (
    <div className="container-page flex min-h-[60vh] max-w-xl flex-col justify-center py-12">
      <div className="card space-y-5 p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pine-50 text-pine-700">
          <LockIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl">Código de paciente</h1>
          <p className="mt-2 text-sm text-ink-600">
            Este código permite que un médico registre a su paciente en Guía Médica Monagas. Por privacidad, aquí no se
            muestra ningún dato del paciente.
          </p>
        </div>
        {valid ? (
          <>
            <Link
              href={registerHref}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-pine-700 px-6 py-3 text-sm font-semibold text-white hover:bg-pine-800"
            >
              <BadgeCheckIcon className="h-5 w-5" />
              Soy el médico: registrar paciente
            </Link>
            <p className="text-xs text-ink-500">
              Te pediremos iniciar sesión con tu cuenta de médico. Si no eres el médico tratante, no necesitas hacer nada.
            </p>
          </>
        ) : (
          <p className="text-sm text-red-700">El código no tiene el formato correcto. Pide al paciente que lo revise.</p>
        )}
      </div>
    </div>
  );
}
