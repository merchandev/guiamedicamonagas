import { cn } from '@/lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, hint, disabled, id }: SwitchProps) {
  return (
    <label htmlFor={id} className={cn('flex items-start gap-3', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 flex-shrink-0 overflow-hidden rounded-full p-0 transition-colors',
          checked ? 'bg-pine-700' : 'bg-ink-300',
          disabled && 'cursor-not-allowed',
        )}
      >
        {/* left-0 es imprescindible: sin él, el botón centra la bolita y el
            desplazamiento la sacaba del riel, encima del texto de al lado. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
      {(label || hint) && (
        <span>
          {label && <span className="block text-sm font-medium text-ink-800">{label}</span>}
          {hint && <span className="block text-xs text-ink-500">{hint}</span>}
        </span>
      )}
    </label>
  );
}
