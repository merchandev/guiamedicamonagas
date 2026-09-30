import type { Metadata } from 'next';
import Link from 'next/link';
import {
  LEGAL_DOCS,
  LEGAL_EFFECTIVE_DATE_LABEL,
  LEGAL_GROUP_LABELS,
  MEDICAL_DISCLAIMER_NOTICE,
  type LegalDocGroup,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Centro legal',
  description:
    'Todos los textos legales de Guía Médica Monagas: términos, privacidad, datos de salud, verificación de profesionales, pagos, seguridad y reclamos.',
  alternates: { canonical: '/legal' },
};

const GROUP_ORDER: LegalDocGroup[] = ['general', 'privacidad', 'salud', 'profesionales', 'seguridad'];

export default function LegalCenterPage() {
  return (
    <div className="container-page max-w-4xl py-12">
      <h1 className="text-3xl">Centro legal</h1>
      <p className="mt-2 max-w-2xl text-ink-600">
        Aquí están todos los textos que regulan el uso de Guía Médica Monagas. Cada uno lleva su versión y su fecha;
        vigentes desde el {LEGAL_EFFECTIVE_DATE_LABEL}.
      </p>
      <p className="mt-4 rounded-lg border border-pine-200 bg-pine-50 px-4 py-3 text-sm text-pine-900">
        {MEDICAL_DISCLAIMER_NOTICE}
      </p>

      <div className="mt-10 space-y-10">
        {GROUP_ORDER.map((group) => (
          <section key={group} aria-labelledby={`grupo-${group}`}>
            <h2 id={`grupo-${group}`} className="text-lg font-semibold text-ink-900">
              {LEGAL_GROUP_LABELS[group]}
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {LEGAL_DOCS.filter((doc) => doc.group === group).map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={doc.href}
                    className="card block h-full p-4 transition-colors hover:border-pine-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine-600"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-pine-800">{doc.short}</span>
                      <span className="flex-shrink-0 text-xs text-ink-400">v{doc.version}</span>
                    </span>
                    <span className="mt-1 block text-sm text-ink-600">{doc.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-ink-500">
        ¿Tienes un reclamo, una denuncia o una solicitud sobre tus datos?{' '}
        <Link href="/reclamos" className="text-pine-700 underline">
          Usa el canal de reclamos y solicitudes
        </Link>
        .
      </p>
    </div>
  );
}
