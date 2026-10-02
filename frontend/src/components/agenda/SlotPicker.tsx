'use client';

import { useEffect, useMemo, useState } from 'react';
import { capitalizeFirst, caracasDateKey, formatDate, formatTime } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { MonthCalendar, addMonths, monthRange } from './MonthCalendar';

interface SlotPickerProps {
  /** Horarios libres (instantes ISO) entre dos días «AAAA-MM-DD». */
  loadSlots: (from: string, to: string) => Promise<string[]>;
  selectedSlot: string | null;
  onSelectSlot: (slot: string | null) => void;
  /** Cuántos meses hacia adelante se puede navegar (por defecto 6). */
  monthsAhead?: number;
}

/**
 * Elegir día en un calendario de mes y luego la hora. Pide los horarios del
 * mes a la vista; los días sin horarios quedan inhabilitados.
 */
export function SlotPicker({ loadSlots, selectedSlot, onSelectSlot, monthsAhead = 6 }: SlotPickerProps) {
  // El día de hoy se toma una vez, al abrir el calendario.
  const [today] = useState(() => caracasDateKey(Date.now()));
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [day, setDay] = useState<string | null>(null);
  // Respuesta del mes pedido: una respuesta lenta de otro mes no pisa la del actual.
  const [result, setResult] = useState<{ month: string; slots: string[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const { first, last } = monthRange(month);
    loadSlots(first < today ? today : first, last).then(
      (slots) => {
        if (active) setResult({ month, slots });
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [month, today, loadSlots]);

  const loading = !failed && result?.month !== month;
  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    if (result?.month === month) {
      for (const slot of result.slots) {
        const key = caracasDateKey(slot);
        map.set(key, [...(map.get(key) ?? []), slot]);
      }
    }
    return map;
  }, [result, month]);

  const availability = useMemo(() => {
    const out: Record<string, boolean> = {};
    if (result?.month !== month) return out;
    const { first, last } = monthRange(month);
    for (let d = Number(first.slice(8)); d <= Number(last.slice(8)); d++) {
      const key = `${month}-${String(d).padStart(2, '0')}`;
      out[key] = byDay.has(key);
    }
    return out;
  }, [byDay, result, month]);

  const changeMonth = (next: string) => {
    setMonth(next);
    setDay(null);
    setFailed(false);
    onSelectSlot(null);
  };

  const selectDay = (key: string) => {
    if (key === day) return;
    setDay(key);
    onSelectSlot(null);
  };

  const daySlots = day ? (byDay.get(day) ?? []) : [];
  const monthHasSlots = byDay.size > 0;

  return (
    <div className="space-y-4">
      <MonthCalendar
        month={month}
        onMonthChange={changeMonth}
        selected={day}
        onSelect={selectDay}
        availability={availability}
        loading={loading}
        minMonth={thisMonth}
        maxMonth={addMonths(thisMonth, monthsAhead)}
      />
      {failed && <p className="text-sm text-red-700">No se pudieron cargar los horarios. Intenta de nuevo.</p>}
      {!loading && !failed && !monthHasSlots && (
        <p className="text-sm text-ink-600">No hay horarios libres este mes. Prueba con el siguiente.</p>
      )}
      {day && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink-800">{capitalizeFirst(formatDate(`${day}T12:00:00Z`, { dateStyle: 'full' }))}</p>
          <div role="group" aria-label="Hora" className="flex flex-wrap gap-2">
            {daySlots.map((slot) => (
              <button
                key={slot}
                type="button"
                aria-pressed={selectedSlot === slot}
                onClick={() => onSelectSlot(slot)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  selectedSlot === slot
                    ? 'border-pine-700 bg-pine-700 text-white'
                    : 'border-ink-200 text-ink-800 hover:border-pine-600 hover:bg-pine-50',
                )}
              >
                {formatTime(slot)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
