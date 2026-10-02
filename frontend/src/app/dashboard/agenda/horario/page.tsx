'use client';

import dynamic from 'next/dynamic';
import { ScheduleConfigForm } from '@/components/ScheduleConfigForm';
import { ScheduleExceptionsManager } from '@/components/ScheduleExceptionsManager';
import { PageSpinner } from '@/components/ui/Spinner';

const WeeklySchedule = dynamic(() => import('@/components/agenda/WeeklySchedule').then((m) => m.WeeklySchedule), {
  ssr: false,
  loading: () => <PageSpinner />,
});

export default function HorarioPage() {
  return (
    <div className="space-y-6">
      <ScheduleConfigForm />
      <WeeklySchedule />
      <ScheduleExceptionsManager />
    </div>
  );
}
