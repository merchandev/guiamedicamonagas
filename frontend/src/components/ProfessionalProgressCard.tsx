import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { LockIcon } from '@/components/icons';
import { PLAN_TIER_LABELS } from '@/lib/labels';
import { cn } from '@/lib/cn';
import type { ProfessionalProgress } from '@/lib/types';

/**
 * Barra de progreso del registro del médico: todo lo que debe completar, en
 * orden, con lo que exige la publicación (60% de documentos aprobados,
 * biografía y foto) y lo que exigen Profesional Plus y Premium (100%).
 */
export function ProfessionalProgressCard({ progress, isPublished }: { progress: ProfessionalProgress; isPublished: boolean }) {
  const { documents } = progress;
  const missingToPublish = progress.publication.filter((r) => !r.done);

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <h2 className="font-semibold text-ink-900">Tu registro está completo al {progress.percent}%</h2>
        {isPublished ? (
          <Badge tone="pine" className="whitespace-nowrap">Perfil público</Badge>
        ) : (
          <Badge tone="amber" className="whitespace-nowrap">Aún no es público</Badge>
        )}
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label="Progreso del registro"
      >
        <div className="h-full rounded-full bg-pine-600 transition-all" style={{ width: `${progress.percent}%` }} />
      </div>

      {!isPublished && missingToPublish.length > 0 && (
        <div className="mt-4 rounded-lg bg-gold-50 p-4 text-sm text-gold-900">
          <p className="font-medium">Para aparecer en el directorio te falta:</p>
          <ul className="mt-1 list-disc pl-5">
            {missingToPublish.map((r) => (
              <li key={r.key}>{r.label}</li>
            ))}
          </ul>
        </div>
      )}

      <ol className="mt-5 space-y-2">
        {progress.items.map((item) => {
          const locked = !!item.lockedUntil;
          const content = (
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  item.done ? 'bg-pine-600 text-white' : locked ? 'bg-ink-100 text-ink-400' : 'border border-ink-300 text-ink-400',
                )}
              >
                {item.done ? '✓' : locked ? <LockIcon className="h-3 w-3" /> : ''}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', item.done ? 'text-ink-500' : locked ? 'text-ink-400' : 'font-medium text-ink-900')}>
                  {item.label}
                  {item.requiredToPublish && !item.done && (
                    <span className="ml-2 text-xs font-normal text-amber-700">obligatorio para publicarte</span>
                  )}
                  {locked && item.lockedUntil && (
                    <span className="ml-2 text-xs font-normal">
                      disponible con {PLAN_TIER_LABELS[item.lockedUntil]?.label ?? item.lockedUntil}
                    </span>
                  )}
                </p>
                {item.detail && <p className="text-xs text-ink-500">{item.detail}</p>}
                {item.fraction !== undefined && !item.done && (
                  <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-pine-500" style={{ width: `${Math.round(item.fraction * 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          );
          return (
            <li key={item.key}>
              {item.href && !item.done && !locked ? (
                <Link href={item.href} className="block rounded-lg p-1 hover:bg-ink-50">
                  {content}
                </Link>
              ) : (
                <div className="p-1">{content}</div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-xs text-ink-500">
        {progress.fullDocuments
          ? 'Tienes todos tus documentos aprobados: puedes contratar Profesional Plus o Premium.'
          : `Profesional Plus y Premium requieren el 100% de tus documentos aprobados (tienes ${documents.approved} de ${documents.required}).`}
      </p>
    </div>
  );
}
