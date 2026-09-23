import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

// Mismo alto/relleno que el trigger de <Select> (h-11 px-3) para que un
// input de texto y un dropdown en la misma fila se vean del mismo tamaño —
// antes este campo no tenía ni alto ni relleno propios y se veía angosto y
// aplastado junto a cualquier <Select>.
const fieldBase =
  'block w-full rounded-lg border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-sm placeholder:text-ink-400 focus:border-pine-600 focus:ring-pine-600 disabled:bg-ink-50 disabled:text-ink-400';

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
          className={cn(fieldBase, 'h-11', error && 'border-red-400 focus:border-red-500 focus:ring-red-500', className)}
          {...props}
        />
        {hint && !error && <p className="field-hint">{hint}</p>}
        {error && <p className="field-error">{error}</p>}
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
          className={cn(fieldBase, error && 'border-red-400 focus:border-red-500 focus:ring-red-500', className)}
          {...props}
        />
        {hint && !error && <p className="field-hint">{hint}</p>}
        {error && <p className="field-error">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

// El dropdown con estilo propio vive en `./Select` (el `<select>` nativo no
// se puede personalizar en su menú desplegable).
export { Select } from './Select';
