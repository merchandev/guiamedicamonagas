'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PrescriptionForm } from '@/components/prescriptions/PrescriptionForm';
import { PageSpinner } from '@/components/ui/Spinner';

function FormWithSource() {
  // ?desde=… llega desde «Usar como base» en el detalle de un récipe.
  const sourceId = useSearchParams().get('desde');
  return <PrescriptionForm key={sourceId ?? 'nuevo'} sourceId={sourceId} />;
}

export default function NewPrescriptionPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/recipes" className="text-sm text-pine-700 hover:underline">
          ← Récipes
        </Link>
        <h1 className="mt-1 text-2xl">Nuevo récipe</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Lleva tus datos, los del establecimiento, tu firma y tu sello. Al emitirlo recibe un número y un código para que el
          paciente y la farmacia lo verifiquen.
        </p>
      </div>
      <Suspense fallback={<PageSpinner />}>
        <FormWithSource />
      </Suspense>
    </div>
  );
}
