'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';
import { shrinkImageIfLarge } from '@/lib/image-upload';

/**
 * Botón para elegir un archivo que funciona con teclado: el `<input type="file">`
 * queda visualmente oculto pero enfocable (Tab lo alcanza; Enter o Espacio
 * abren el selector), y la etiqueta muestra el anillo de foco. Con
 * `className="hidden"` el campo quedaba fuera del orden de tabulación.
 */
export function FileButton({
  children,
  accept,
  disabled,
  onFile,
  describedBy,
  className,
}: {
  children: React.ReactNode;
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  /** id del texto de ayuda asociado (formatos, tamaño máximo). */
  describedBy?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex min-h-[2.5rem] cursor-pointer items-center justify-center rounded-lg border border-ink-300 bg-white px-3.5 py-2 text-sm font-medium text-ink-800 shadow-sm transition-colors hover:border-ink-400 hover:bg-ink-50',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-pine-600 has-[:focus-visible]:ring-offset-2',
        disabled && 'cursor-not-allowed opacity-60 hover:bg-white',
        className,
      )}
    >
      {children}
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-describedby={describedBy}
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          // Se limpia para poder volver a elegir el mismo archivo tras un error.
          e.target.value = '';
          // Las fotos grandes del teléfono se reducen antes de subir (ver image-upload.ts).
          if (file) onFile(await shrinkImageIfLarge(file));
        }}
      />
    </label>
  );
}
