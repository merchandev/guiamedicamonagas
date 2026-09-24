import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

// Mismo alto/relleno que el trigger de <Select> (h-11 px-3) para que un
// input de texto y un dropdown en la misma fila se vean del mismo tamaño.
// Borde ink-300 (no ink-200): sobre una tarjeta blanca, el campo debe verse
// como un campo y no fundirse con el fondo ni con el campo de al lado.
const fieldBase =
  'block w-full rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-sm transition-colors placeholder:text-ink-400 hover:border-ink-400 focus:border-pine-600 focus:ring-pine-600 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400';

const errorClasses = 'border-red-400 hover:border-red-500 focus:border-red-500 focus:ring-red-500';

/** ids de ayuda/error para `aria-describedby`: el lector de pantalla los lee al enfocar el campo. */
function describedBy(fieldId: string | undefined, hint?: string, error?: string) {
  if (!fieldId) return undefined;
  if (error) return `${fieldId}-error`;
  if (hint) return `${fieldId}-hint`;
  return undefined;
}

function FieldMessages({ fieldId, hint, error }: { fieldId?: string; hint?: string; error?: string }) {
  return (
    <>
      {hint && !error && (
        <p id={fieldId ? `${fieldId}-hint` : undefined} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={fieldId ? `${fieldId}-error` : undefined} className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldWrapperProps;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, required, className, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="field-label">
            {label}
            {required && <span className="text-pine-700"> *</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(inputId, hint, error)}
          className={cn(fieldBase, 'h-11', error && errorClasses, className)}
          {...props}
        />
        <FieldMessages fieldId={inputId} hint={hint} error={error} />
      </div>
    );
  },
);
Input.displayName = 'Input';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldWrapperProps;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, required, className, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="field-label">
            {label}
            {required && <span className="text-pine-700"> *</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(inputId, hint, error)}
          className={cn(fieldBase, 'leading-relaxed', error && errorClasses, className)}
          {...props}
        />
        <FieldMessages fieldId={inputId} hint={hint} error={error} />
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

// El dropdown con estilo propio vive en `./Select` (el `<select>` nativo no
// se puede personalizar en su menú desplegable).
export { Select } from './Select';
