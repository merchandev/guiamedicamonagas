'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

// Colores normales y de "deshabilitado" por separado: mientras carga, el botón
// conserva su color (antes se volvía gris al hacer clic, porque «cargando»
// usaba el mismo atributo `disabled` que un botón inactivo).
const variants: Record<Variant, { idle: string; off: string }> = {
  primary: { idle: 'bg-pine-700 text-white hover:bg-pine-800 active:bg-pine-900', off: 'bg-ink-200 text-white' },
  secondary: { idle: 'bg-ink-900 text-white hover:bg-ink-800', off: 'bg-ink-200 text-white' },
  outline: { idle: 'border border-ink-200 bg-white text-ink-800 hover:bg-ink-50', off: 'border border-ink-200 bg-white text-ink-300' },
  ghost: { idle: 'text-ink-700 hover:bg-ink-100', off: 'text-ink-300' },
  danger: { idle: 'bg-red-600 text-white hover:bg-red-700', off: 'bg-red-200 text-white' },
};

// md coincide con la altura de Input/Select (h-11) para que un botón junto a
// un campo en la misma fila (ej. "Agregar" al lado de un <Select>) se alinee.
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
          disabled ? cn(variants[variant].off, 'cursor-not-allowed') : variants[variant].idle,
          loading && 'cursor-wait',
          sizes[size],
          className,
        )}
        {...props}
      >
        {/* El texto se queda en su sitio (transparente, pero el lector de
            pantalla lo sigue leyendo) y la ruedita va encima: el botón no
            cambia de tamaño al hacer clic. */}
        <span className={cn('inline-flex items-center justify-center gap-2', loading && 'opacity-0')}>{children}</span>
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </span>
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';
