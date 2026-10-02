'use client';

import { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type { DateSelectArg, EventChangeArg, EventClickArg, EventInput } from '@fullcalendar/core';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';

interface Block {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Lunes primero, como en la cuadrícula.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_OPTIONS = DAY_ORDER.map((value) => ({ value: String(value), label: DAY_LABELS[value] }));

// Una semana fija de referencia, de lunes 2 a domingo 8 de enero de 2023: la
// cuadrícula muestra solo los días de la semana, sin fechas.
const dateForDay = (dayOfWeek: number) => `2023-01-0${dayOfWeek === 0 ? 8 : 1 + dayOfWeek}`;
const hhmm = (date: Date) => date.toISOString().slice(11, 16);
const strip = (b: Block): Block => ({ dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime });
const byDayAndTime = (a: Block, b: Block) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime);

/**
 * Horario semanal de atención. En la cuadrícula se pinta un bloque
 * arrastrando sobre las horas, se mueve o se estira con el ratón (o
 * manteniendo presionado en el teléfono) y se quita tocándolo. Debajo, la
 * misma lista con un formulario, para hacerlo todo sin arrastrar.
 */
export function WeeklySchedule() {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ dayOfWeek: '1', startTime: '08:00', endTime: '12:00' });
  const [toRemove, setToRemove] = useState<number | null>(null);

  useEffect(() => {
    api.get<Block[]>('/agenda/me/blocks').then(
      (list) => setBlocks(list.map(strip).sort(byDayAndTime)),
      (e) => {
        if (e instanceof ApiError && e.status === 403) setLocked(true);
        else setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu horario');
      },
    );
  }, []);

  const save = (next: Block[]) => {
    const previous = blocks;
    setBlocks([...next].sort(byDayAndTime));
    setError(null);
    setSaved(false);
    setSaving(true);
    api
      .put<Block[]>('/agenda/me/blocks', { blocks: next.map(strip) })
      .then(
        (list) => {
          setBlocks(list.map(strip).sort(byDayAndTime));
          setSaved(true);
        },
        (e) => {
          setBlocks(previous);
          setError(e instanceof ApiError ? e.message : 'No se pudo guardar el horario');
        },
      )
      .finally(() => setSaving(false));
  };

  const events = useMemo<EventInput[]>(
    () =>
      (blocks ?? []).map((b, index) => ({
        id: String(index),
        title: 'Atención',
        start: `${dateForDay(b.dayOfWeek)}T${b.startTime}:00`,
        end: `${dateForDay(b.dayOfWeek)}T${b.endTime}:00`,
      })),
    [blocks],
  );

  if (locked) return null;
  if (!blocks) {
    return (
      <div className="card flex justify-center p-8">
        {error ? <Alert tone="error">{error}</Alert> : <Spinner />}
      </div>
    );
  }

  const fromEvent = (start: Date, end: Date): Block | null => {
    if (start.getUTCDate() !== new Date(end.getTime() - 1).getUTCDate()) return null;
    return { dayOfWeek: start.getUTCDay(), startTime: hhmm(start), endTime: hhmm(end) === '00:00' ? '23:59' : hhmm(end) };
  };

  const onSelect = (info: DateSelectArg) => {
    const block = fromEvent(info.start, info.end);
    info.view.calendar.unselect();
    if (block) save([...blocks, block]);
  };

  const onChange = (info: EventChangeArg) => {
    const index = Number(info.event.id);
    const block = info.event.start && info.event.end ? fromEvent(info.event.start, info.event.end) : null;
    if (!block) {
      info.revert();
      return;
    }
    save(blocks.map((b, i) => (i === index ? block : b)));
  };

  const onClick = (info: EventClickArg) => setToRemove(Number(info.event.id));

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.endTime <= form.startTime) {
      setError('La hora de fin debe ser posterior a la de inicio');
      return;
    }
    save([...blocks, { dayOfWeek: Number(form.dayOfWeek), startTime: form.startTime, endTime: form.endTime }]);
  };

  const removing = toRemove !== null ? blocks[toRemove] : null;

  return (
    <div className="card space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink-900">Horario semanal</h2>
        <p className="text-xs text-ink-500" aria-live="polite">
          {saving ? 'Guardando…' : saved ? 'Cambios guardados' : ''}
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-ink-600">
        Arrastra sobre las horas para marcar cuándo atiendes; mueve o estira un bloque para cambiarlo y tócalo para quitarlo.
        Se guarda solo.
      </p>

      <div className="gmm-calendar overflow-x-auto">
        <div className="min-w-[640px]">
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin]}
            locale={esLocale}
            timeZone="UTC"
            initialView="timeGridWeek"
            initialDate="2023-01-02"
            headerToolbar={false}
            dayHeaderFormat={{ weekday: 'long' }}
            firstDay={1}
            allDaySlot={false}
            height="auto"
            slotMinTime="05:00:00"
            slotMaxTime="23:00:00"
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            selectable
            selectMirror
            selectOverlap={false}
            editable
            eventOverlap={false}
            eventResizableFromStart
            eventInteractive
            longPressDelay={400}
            nowIndicator={false}
            events={events}
            select={onSelect}
            eventChange={onChange}
            eventClick={onClick}
            eventClassNames="gmm-schedule-block"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {DAY_ORDER.map((dayOfWeek) => {
          const dayBlocks = blocks.map((b, index) => ({ ...b, index })).filter((b) => b.dayOfWeek === dayOfWeek);
          return (
            <div key={dayOfWeek} className="rounded-lg border border-ink-100 p-3">
              <p className="text-sm font-semibold text-ink-800">{DAY_LABELS[dayOfWeek]}</p>
              {dayBlocks.length === 0 ? (
                <p className="mt-1 text-xs text-ink-500">Sin horario</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {dayBlocks.map((b) => (
                    <li key={b.index} className="flex items-center justify-between text-sm text-ink-600">
                      <span>
                        {b.startTime} – {b.endTime}
                      </span>
                      <button
                        type="button"
                        onClick={() => setToRemove(b.index)}
                        className="text-xs font-medium text-red-700 hover:underline"
                        aria-label={`Eliminar el bloque del ${DAY_LABELS[dayOfWeek].toLowerCase()} de ${b.startTime} a ${b.endTime}`}
                      >
                        Eliminar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={add} className="grid gap-3 border-t border-ink-100 pt-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Select label="Día" value={form.dayOfWeek} onChange={(v) => setForm({ ...form, dayOfWeek: v })} options={DAY_OPTIONS} />
        <Input label="Desde" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
        <Input label="Hasta" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
        <Button type="submit" loading={saving}>
          Agregar bloque
        </Button>
      </form>

      {removing && (
        <Modal open onClose={() => setToRemove(null)} title="Quitar el bloque">
          <div className="space-y-4 text-sm text-ink-800">
            <p>
              ¿Quitar el bloque del {DAY_LABELS[removing.dayOfWeek].toLowerCase()} de {removing.startTime} a {removing.endTime}? Las
              citas que ya tengas no se cancelan.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  save(blocks.filter((_, i) => i !== toRemove));
                  setToRemove(null);
                }}
              >
                Quitar el bloque
              </Button>
              <Button variant="ghost" onClick={() => setToRemove(null)}>
                Dejarlo
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
