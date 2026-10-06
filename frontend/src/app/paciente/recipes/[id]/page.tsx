'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, apiBlob, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import type { PatientPrescription } from '@/lib/prescriptions';
import { PrescriptionPaper } from '@/components/prescriptions/PrescriptionPaper';
import { PrescriptionShare } from '@/components/prescriptions/PrescriptionShare';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';

export default function PatientPrescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const [prescription, setPrescription] = useState<PatientPrescription | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PatientPrescription>(`/prescriptions/me/${id}`).then(setPrescription, (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el récipe'),
    );
  }, [id]);

  if (!prescription) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  const doctor = prescription.content.prescriber.fullName;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/paciente/recipes" className="text-sm text-pine-700 hover:underline">
          ← Mis récipes
        </Link>
        <h1 className="mt-1 text-2xl">Récipe N° {prescription.numberLabel}</h1>
        <p className="mt-1 text-sm text-ink-600">
          De{' '}
          {prescription.doctorSlug ? (
            <Link href={`/medicos/${prescription.doctorSlug}`} className="underline">
              Dr(a). {doctor}
            </Link>
          ) : (
            `Dr(a). ${doctor}`
          )}
          , emitido el {formatDate(prescription.issuedAt, { dateStyle: 'long' })}.
        </p>
      </div>

      {prescription.status === 'ANNULLED' && (
        <Alert tone="warning" title="Tu médico anuló este récipe">
          Ya no sirve para comprar medicamentos. Motivo: {prescription.annulReason}. Si tienes dudas, consulta a tu médico.
        </Alert>
      )}
      {prescription.status === 'EXPIRED' && (
        <Alert tone="warning">Este récipe venció: ya no sirve para comprar medicamentos. Pide uno nuevo a tu médico si lo necesitas.</Alert>
      )}

      <PrescriptionShare view={prescription} downloadPdf={() => apiBlob(`/prescriptions/me/${id}/pdf`)} />
      <PrescriptionPaper view={prescription} />
    </div>
  );
}
