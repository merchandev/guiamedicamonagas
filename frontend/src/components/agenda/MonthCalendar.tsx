'use client';

import { cn } from '@/lib/cn';
import { capitalizeFirst } from '@/lib/dates';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const dayLabel = new Intl.DateTimeFormat('es-VE', { dateStyle: 'full', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** «2026-10» → el mes siguiente o anterior. */
export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Primer y último día de un mes: «2026-10-01», «2026-10-31». */
export function monthRange(month: string): { first: string; last: string } {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, '0')}` };
}

interface MonthCalendarProps {
  /** «2026-10» */
  month: string;
  onMonthChange: (month: string) => void;
  selected: string | null;
  onSelect: (dateKey: string) => void;
  /** Días con horarios libres (true) o sin ellos (false); ausente = sin datos todavía. */
  availability: Record<string, boolean>;
  loading?: boolean;
  /** No se puede ir antes de este mes ni después del otro. */
  minMonth?: string;
  maxMonth?: string;
}

/**
 * Calendario de un mes para elegir un día: resalta los que tienen horarios
 * libres y deja inhabilitados los demás. Con teclado: cada día es un botón.
 */
export function MonthCalendar({ month, onMonthChange, selected, onSelect, availability, loading, minMonth, maxMonth }: MonthCalendarProps) {
  const { first, last } = monthRange(month);
  const lastDay = Number(last.slice(8));
  // Lunes = 0 … domingo = 6.
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  const canPrev = !minMonth || month > minMonth;
  const canNext = !maxMonth || month < maxMonth;
  const title = monthLabel.format(new Date(`${first}T12:00:00Z`));

  return (
    <div role="group" aria-label="Fecha" className="max-w-md rounded-xl border border-ink-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          disabled={!canPrev}
          aria-label="Mes anterior"
          className="rounded-lg px-3 py-1.5 text-lg text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹
        </button>
        <p className="text-sm font-semibold text-ink-900" aria-live="polite">
          {capitalizeFirst(title)}
        </p>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          disabled={!canNext}
          aria-label="Mes siguiente"
          className="rounded-lg px-3 py-1.5 text-lg text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-[11px] font-medium uppercase text-ink-500">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateKey, index) => {
          if (!dateKey) return <span key={`vacio-${index}`} />;
          const has = availability[dateKey];
          const isSelected = selected === dateKey;
          const label = `${dayLabel.format(new Date(`${dateKey}T12:00:00Z`))}${has ? ', con horarios libres' : has === false ? ', sin horarios' : ''}`;
          return (
            <button
              key={dateKey}
              type="button"
              disabled={!has}
              aria-pressed={isSelected}
              aria-label={label}
              onClick={() => onSelect(dateKey)}
              className={cn(
                'aspect-square rounded-lg text-sm transition-colors',
                isSelected
                  ? 'bg-pine-700 font-semibold text-white'
                  : has
                    ? 'bg-pine-50 font-medium text-pine-800 hover:bg-pine-100'
                    : 'cursor-not-allowed text-ink-400',
              )}
            >
              {Number(dateKey.slice(8))}
            </button>
          );
        })}
      </div>
      {loading && <p className="mt-2 text-center text-xs text-ink-500">Buscando horarios libres…</p>}
    </div>
  );
}
