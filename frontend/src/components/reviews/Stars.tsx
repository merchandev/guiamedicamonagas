import { cn } from '@/lib/cn';
import { formatAverage } from '@/lib/reviews';

export const STAR_PATH =
  'M10 1.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L10 14.95 4.75 17.7l1-5.85L1.5 7.7l5.9-.9L10 1.5z';

const SIZES = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-6 w-6' } as const;

/**
 * Estrellas de solo lectura (admite fracciones, p. ej. 4,6). Para lectores de
 * pantalla es una imagen con el valor en texto.
 */
export function Stars({ value, size = 'md', className }: { value: number; size?: keyof typeof SIZES; className?: string }) {
  const box = SIZES[size];
  const label = `${Number.isInteger(value) ? value : formatAverage(value)} de 5 estrellas`;
  return (
    <span role="img" aria-label={label} className={cn('inline-flex items-center gap-0.5', className)}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, value - index));
        return (
          <span key={index} className={cn('relative inline-block flex-shrink-0', box)} aria-hidden="true">
            <svg viewBox="0 0 20 20" className={cn('absolute inset-0 fill-ink-200', box)}>
              <path d={STAR_PATH} />
            </svg>
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <svg viewBox="0 0 20 20" className={cn('fill-gold-500', box)}>
                  <path d={STAR_PATH} />
                </svg>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
