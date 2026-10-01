'use client';

import Link from 'next/link';
import { openCookiePreferences } from '@/components/CookieConsent';
import { EMERGENCY_NOTICE, MEDICAL_DISCLAIMER_NOTICE, legalDoc, type LegalDocSlug } from '@/lib/legal';

// Los textos que más se consultan; el resto está en el Centro legal.
const LEGAL_LINKS: LegalDocSlug[] = ['terminos', 'privacidad', 'descargo-medico', 'verificacion', 'cookies', 'aviso-legal'];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-ink-100 bg-white">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink-950">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pine-700 text-sm font-bold text-white">
              GM
            </span>
            Guía Médica Monagas
          </div>
          <p className="mt-3 max-w-sm text-sm text-ink-600">
            Directorio de médicos del estado Monagas con verificación documental. Una persona del equipo revisa los
            avales legales y gremiales de cada profesional (MPPS y Colegio de Médicos); la insignia de verificado se
            otorga solo con todos los documentos aprobados.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink-900">Directorio</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li><Link href="/medicos" className="hover:text-pine-700">Médicos</Link></li>
            <li><Link href="/especialidades" className="hover:text-pine-700">Especialidades</Link></li>
            <li><Link href="/farmacias" className="hover:text-pine-700">Farmacias y clínicas</Link></li>
            <li><Link href="/planes" className="hover:text-pine-700">Planes y precios</Link></li>
            <li><Link href="/registro?tipo=medico" className="hover:text-pine-700">Registrar mi consultorio</Link></li>
            <li><Link href="/registro?tipo=paciente" className="hover:text-pine-700">Crear cuenta de paciente</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink-900">Legal</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            {LEGAL_LINKS.map((slug) => {
              const doc = legalDoc(slug);
              return (
                <li key={slug}>
                  <Link href={doc.href} className="hover:text-pine-700">
                    {doc.short}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link href="/reclamos" className="hover:text-pine-700">
                Reclamos y solicitudes
              </Link>
            </li>
            <li>
              <Link href="/legal" className="font-medium text-pine-700 hover:underline">
                Centro legal: todos los textos
              </Link>
            </li>
            <li>
              <button onClick={openCookiePreferences} className="text-left hover:text-pine-700">
                Configuración de cookies
              </button>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-100 py-4">
        <div className="container-page space-y-1 text-xs text-ink-500">
          <p>
            {MEDICAL_DISCLAIMER_NOTICE} {EMERGENCY_NOTICE}
          </p>
          <p className="text-ink-500">© {new Date().getFullYear()} Guía Médica Monagas.</p>
        </div>
      </div>
    </footer>
  );
}
