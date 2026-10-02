'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageSpinner } from '@/components/ui/Spinner';

// El calendario solo existe en el navegador y no pesa en el resto del sitio.
const AgendaCalendar = dynamic(() => import('@/components/agenda/AgendaCalendar').then((m) => m.AgendaCalendar), {
  ssr: false,
  loading: () => <PageSpinner />,
});

function CalendarWithLink() {
  // ?cita=… llega desde un aviso de la campana o un correo: abre esa cita.
  const appointmentId = useSearchParams().get('cita');
  return <AgendaCalendar initialAppointmentId={appointmentId} />;
}

export default function AgendaPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <CalendarWithLink />
    </Suspense>
  );
}
