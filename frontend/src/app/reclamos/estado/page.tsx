import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalRequestLookup } from '@/components/legal/LegalRequestLookup';

export const metadata: Metadata = {
  title: 'Estado de una solicitud',
  description: 'Consulta el estado de un reclamo, denuncia o solicitud con tu número de seguimiento.',
  robots: { index: false, follow: false },
};

export default function LegalRequestStatusPage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <nav aria-label="Ruta" className="text-sm text-ink-500">
        <Link href="/reclamos" className="text-pine-700 underline underline-offset-2">
          Reclamos y solicitudes
        </Link>{' '}
        <span aria-hidden>›</span> Estado
      </nav>
      <h1 className="mt-2 text-3xl">Estado de una solicitud</h1>
      <p className="mb-6 mt-2 text-ink-600">
        Escribe el número de seguimiento que recibiste y el correo con el que enviaste la solicitud.
      </p>
      <Suspense fallback={null}>
        <LegalRequestLookup />
      </Suspense>
    </div>
  );
}
