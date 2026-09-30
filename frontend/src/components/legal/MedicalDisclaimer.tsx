import Link from 'next/link';
import { cn } from '@/lib/cn';
import { EMERGENCY_NOTICE, MEDICAL_DISCLAIMER_NOTICE } from '@/lib/legal';

/**
 * Aviso breve de que la plataforma es un directorio y no presta el acto
 * médico. Va en perfiles, directorio y reserva de citas.
 */
export function MedicalDisclaimer({ emergency = false, className }: { emergency?: boolean; className?: string }) {
  return (
    <aside
      aria-label="Aviso de responsabilidad médica"
      className={cn('rounded-lg border border-ink-100 bg-ink-50/60 px-4 py-3 text-xs leading-relaxed text-ink-600', className)}
    >
      <p>
        {MEDICAL_DISCLAIMER_NOTICE}{' '}
        <Link href="/descargo-medico" className="font-medium text-pine-700 underline">
          Descargo médico
        </Link>
        .
      </p>
      {emergency && <p className="mt-1 font-medium text-ink-700">{EMERGENCY_NOTICE}</p>}
    </aside>
  );
}
