import { formatAverage, opinionsLabel, type ReviewSummaryData } from '@/lib/reviews';
import { Stars } from './Stars';

/** Promedio y distribución por estrellas; antes de 3 opiniones publicadas, solo la cantidad. */
export function ReviewSummary({ summary }: { summary: ReviewSummaryData }) {
  if (summary.average === null || !summary.distribution) {
    return (
      <p className="text-sm text-ink-600">
        {summary.count === 0
          ? 'Todavía no tiene opiniones publicadas.'
          : `Aún no tiene suficientes opiniones para mostrar un promedio (${opinionsLabel(summary.count)}).`}
      </p>
    );
  }
  const max = Math.max(...summary.distribution.map((row) => row.count), 1);
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div>
        <p className="font-display text-4xl font-semibold text-ink-950">{formatAverage(summary.average)}</p>
        <Stars value={summary.average} />
        <p className="mt-1 text-sm text-ink-600">{opinionsLabel(summary.count)}</p>
      </div>
      <dl className="min-w-[12rem] flex-1 space-y-1">
        {summary.distribution.map((row) => (
          <div key={row.stars} className="flex items-center gap-2 text-sm">
            <dt className="w-[5.5rem] flex-shrink-0 whitespace-nowrap text-ink-600">
              {row.stars === 1 ? '1 estrella' : `${row.stars} estrellas`}
            </dt>
            <dd className="flex flex-1 items-center gap-2">
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                <span className="block h-full rounded-full bg-gold-500" style={{ width: `${(row.count / max) * 100}%` }} />
              </span>
              <span className="w-6 text-right text-ink-700">{row.count}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
