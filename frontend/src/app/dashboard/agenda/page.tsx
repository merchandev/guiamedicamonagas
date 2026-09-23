import { ScheduleConfigForm } from '@/components/ScheduleConfigForm';
import { ScheduleBlocksManager } from '@/components/ScheduleBlocksManager';
import { ScheduleExceptionsManager } from '@/components/ScheduleExceptionsManager';

export default function AgendaPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Agenda</h1>
      <ScheduleConfigForm />
      <ScheduleBlocksManager />
      <ScheduleExceptionsManager />
    </div>
  );
}
