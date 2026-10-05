'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';
import { STAR_PATH } from './Stars';

const LABELS = ['1 estrella: muy mala', '2 estrellas: mala', '3 estrellas: regular', '4 estrellas: buena', '5 estrellas: excelente'];

/**
 * Elegir de 1 a 5 estrellas con botones de opción nativos: funciona con el
 * teclado (flechas) y con lectores de pantalla.
 */
export function StarInput({
  value,
  onChange,
  legend = 'Tu calificación',
  error,
}: {
  value: number;
  onChange: (value: number) => void;
  legend?: string;
  error?: string;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-800">{legend}</legend>
      <div className="flex items-center gap-1">
        {LABELS.map((label, index) => {
          const stars = index + 1;
          const active = value >= stars;
          return (
            <label
              key={stars}
              title={label}
              className="cursor-pointer rounded-md p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-pine-500"
            >
              <input
                type="radio"
                name={name}
                value={stars}
                checked={value === stars}
                onChange={() => onChange(stars)}
                className="sr-only"
                aria-label={label}
              />
              <svg viewBox="0 0 20 20" className={cn('h-8 w-8', active ? 'fill-gold-500' : 'fill-ink-200')} aria-hidden="true">
                <path d={STAR_PATH} />
              </svg>
            </label>
          );
        })}
        <span className="ml-2 text-sm text-ink-600" aria-hidden="true">
          {value ? LABELS[value - 1].split(': ')[1] : 'Elige de 1 a 5'}
        </span>
      </div>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}
