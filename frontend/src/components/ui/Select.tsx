'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  name?: string;
}

/** Compara ignorando mayúsculas y tildes, para buscar tecleando («mat» → «Maturín»). */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Dropdown con estilo propio (no el `<select>` nativo del sistema operativo,
 * cuyo menú no se puede personalizar y rompe la estética del sitio).
 *
 * Teclado (patrón combobox de WAI-ARIA): el foco se queda en el botón y la
 * opción activa se anuncia con `aria-activedescendant`. Enter, Espacio o las
 * flechas abren la lista; flechas, Inicio y Fin se mueven; Enter o Espacio
 * eligen; Escape cierra sin elegir; Tab cierra y sigue al próximo campo;
 * teclear letras salta a la primera opción que empieza así.
 */
export function Select({
  label,
  hint,
  error,
  required,
  placeholder = 'Selecciona',
  value,
  onChange,
  options,
  disabled,
  className,
  name,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: '', timer: 0 });
  const reactId = useId();
  const triggerId = name ?? reactId;
  const listId = `${triggerId}-listbox`;
  const optionId = (index: number) => `${triggerId}-option-${index}`;
  const hintId = `${triggerId}-hint`;
  const errorId = `${triggerId}-error`;

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlighted(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  // Mantiene visible la opción activa al moverse con las flechas.
  useEffect(() => {
    if (open) document.getElementById(optionId(highlighted))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlighted]);

  const choose = (index: number) => {
    const opt = options[index];
    if (opt) onChange(opt.value);
    setOpen(false);
  };

  const jumpTo = (key: string) => {
    window.clearTimeout(typeahead.current.timer);
    typeahead.current.text += normalize(key);
    typeahead.current.timer = window.setTimeout(() => (typeahead.current.text = ''), 700);
    const index = options.findIndex((o) => normalize(o.label).startsWith(typeahead.current.text));
    if (index >= 0) {
      setHighlighted(index);
      if (!open) onChange(options[index].value);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        jumpTo(e.key);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setHighlighted(0);
        break;
      case 'End':
        e.preventDefault();
        setHighlighted(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(highlighted);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) jumpTo(e.key);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {label && (
        <label htmlFor={triggerId} className="field-label">
          {label}
          {required && <span className="text-pine-700"> *</span>}
        </label>
      )}

      <button
        type="button"
        id={triggerId}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && options.length ? optionId(highlighted) : undefined}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-ink-300 bg-white px-3.5 text-left text-sm text-ink-800 shadow-sm transition-colors',
          'hover:border-ink-400 focus:border-pine-600 focus:outline-none focus:ring-2 focus:ring-pine-600',
          disabled && 'cursor-not-allowed bg-ink-50 text-ink-400 hover:border-ink-300',
          error && 'border-red-400 focus:border-red-500 focus:ring-red-500',
          className,
        )}
      >
        <span className={cn('truncate', !selected && 'text-ink-400')}>{selected ? selected.label : placeholder}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn('flex-shrink-0 text-ink-400 transition-transform', open && 'rotate-180')}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute z-30 mt-1.5 max-h-64 w-full min-w-[10rem] overflow-auto rounded-lg border border-ink-200 bg-white p-1 shadow-card"
          >
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-400">Sin opciones</p>
            ) : (
              options.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <div
                    key={option.value || '__empty__'}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlighted(index)}
                    // Evita que el clic le quite el foco al botón; la selección
                    // va en onClick para no romper el desplazamiento táctil.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(index)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
                      isSelected ? 'bg-pine-50 font-medium text-pine-800' : 'text-ink-700',
                      highlighted === index && (isSelected ? 'ring-1 ring-inset ring-pine-300' : 'bg-ink-100'),
                    )}
                  >
                    {option.label}
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
