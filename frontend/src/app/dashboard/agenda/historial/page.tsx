'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppointmentHistory } from '@/components/agenda/AppointmentHistory';
import { PageSpinner } from '@/components/ui/Spinner';

function HistoryWithPatient() {
  // ?paciente=… llega desde el detalle de una cita o la lista de pacientes.
  const patientId = useSearchParams().get('paciente');
  return <AppointmentHistory key={patientId ?? 'todas'} patientId={patientId} />;
}

export default function HistorialPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <HistoryWithPatient />
    </Suspense>
  );
}
