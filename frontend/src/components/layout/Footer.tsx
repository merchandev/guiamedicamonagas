'use client';

import Link from 'next/link';
import { openCookiePreferences } from '@/components/CookieConsent';

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
            Directorio médico verificado del estado Monagas. Cada profesional pasa por un proceso de validación de
            sus avales legales y gremiales (MPPS y Colegio de Médicos de Monagas) antes de aparecer
            públicamente.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink-900">Directorio</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li><Link href="/medicos" className="hover:text-pine-700">Médicos</Link></li>
            <li><Link href="/especialidades" className="hover:text-pine-700">Especialidades</Link></li>
            <li><Link href="/farmacias" className="hover:text-pine-700">Farmacias y clínicas</Link></li>
            <li><Link href="/planes" className="hover:text-pine-700">Planes y precios</Link></li>
            <li><Link href="/registro" className="hover:text-pine-700">Registrar mi consultorio</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink-900">Legal</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li><Link href="/terminos-y-condiciones" className="hover:text-pine-700">Términos y condiciones</Link></li>
            <li><Link href="/privacidad" className="hover:text-pine-700">Política de privacidad</Link></li>
            <li>
              <button onClick={openCookiePreferences} className="text-left hover:text-pine-700">
                Configuración de cookies
              </button>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-100 py-4">
        <p className="container-page text-xs text-ink-400">
          © {new Date().getFullYear()} Guía Médica Monagas. Este sitio es un directorio informativo y no sustituye
          una consulta médica ni constituye asesoría médica.
        </p>
      </div>
    </footer>
  );
}
