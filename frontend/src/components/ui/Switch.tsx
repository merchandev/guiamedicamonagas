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
          'relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors',
          checked ? 'bg-pine-700' : 'bg-ink-200',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
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
