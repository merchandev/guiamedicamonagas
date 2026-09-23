'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

interface ScheduleBlock {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_OPTIONS = DAY_LABELS.map((label, value) => ({ value: String(value), label }));

export function ScheduleBlocksManager() {
  const [blocks, setBlocks] = useState<ScheduleBlock[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ dayOfWeek: '1', startTime: '08:00', endTime: '12:00' });

  const load = () =>
    api
      .get<ScheduleBlock[]>('/agenda/me/blocks')
      .then(setBlocks)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setLocked(true);
      });

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/agenda/me/blocks', {
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo agregar el bloque');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    await api.delete(`/agenda/me/blocks/${id}`).catch(() => undefined);
    load();
  };

  if (locked) return null;

  if (blocks === null) {
    return (
      <div className="card flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="card space-y-6 p-6">
      <h2 className="text-lg font-semibold text-ink-900">Horario semanal</h2>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-2 sm:grid-cols-2">
        {DAY_LABELS.map((label, dayOfWeek) => {
          const dayBlocks = blocks.filter((b) => b.dayOfWeek === dayOfWeek);
          return (
            <div key={dayOfWeek} className="rounded-lg border border-ink-100 p-3">
              <p className="text-sm font-semibold text-ink-800">{label}</p>
              {dayBlocks.length === 0 ? (
                <p className="mt-1 text-xs text-ink-400">Sin horario</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {dayBlocks.map((b) => (
                    <li key={b.id} className="flex items-center justify-between text-sm text-ink-600">
                      <span>
                        {b.startTime} – {b.endTime}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(b.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
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
        <Select
          label="Día"
          value={form.dayOfWeek}
          onChange={(v) => setForm({ ...form, dayOfWeek: v })}
          options={DAY_OPTIONS}
        />
        <Input
          label="Desde"
          type="time"
          value={form.startTime}
          onChange={(e) => setForm({ ...form, startTime: e.target.value })}
        />
        <Input
          label="Hasta"
          type="time"
          value={form.endTime}
          onChange={(e) => setForm({ ...form, endTime: e.target.value })}
        />
        <Button type="submit" loading={submitting}>
          Agregar bloque
        </Button>
      </form>
    </div>
  );
}
