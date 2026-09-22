import { cn } from '@/lib/cn';

/**
 * Divisor ondulado entre secciones de color. `colorClassName` debe ser una
 * clase `text-*` (se usa `fill-current`) del color de la sección que el
 * borde curvo "cubre" (normalmente la sección que sigue).
 */
export function WaveDivider({ colorClassName, flip = false }: { colorClassName: string; flip?: boolean }) {
  return (
    <div className={cn('pointer-events-none w-full overflow-hidden leading-none', flip && 'rotate-180')} aria-hidden>
      <svg viewBox="0 0 1440 80" className={cn('h-12 w-full sm:h-16', colorClassName)} preserveAspectRatio="none">
        <path
          fill="currentColor"
          d="M0 32c120 16 360 32 720 32s600-16 720-32v48H0Z"
        />
      </svg>
    </div>
  );
}
