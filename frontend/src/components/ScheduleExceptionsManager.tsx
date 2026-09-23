'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

interface ScheduleException {
  id: string;
  date: string;
  isBlocked: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export function ScheduleExceptionsManager() {
  const [exceptions, setExceptions] = useState<ScheduleException[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ date: '', isBlocked: true, startTime: '', endTime: '', reason: '' });

  const load = () =>
    api
      .get<ScheduleException[]>('/agenda/me/exceptions')
      .then(setExceptions)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setLocked(true);
      });

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/agenda/me/exceptions', {
        date: form.date,
        isBlocked: form.isBlocked,
        startTime: form.isBlocked ? undefined : form.startTime || undefined,
        endTime: form.isBlocked ? undefined : form.endTime || undefined,
        reason: form.reason || undefined,
      });
      setForm({ date: '', isBlocked: true, startTime: '', endTime: '', reason: '' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo agregar la excepción');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    await api.delete(`/agenda/me/exceptions/${id}`).catch(() => undefined);
    load();
  };

  if (locked) return null;

  if (exceptions === null) {
    return (
      <div className="card flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="card space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Vacaciones y días especiales</h2>
        <p className="mt-1 text-sm text-ink-600">
          Bloquea días completos (vacaciones, feriados) o define un horario distinto al habitual para una fecha
          puntual.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {exceptions.length > 0 && (
        <ul className="space-y-2">
          {exceptions.map((ex) => (
            <li key={ex.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3 text-sm">
              <div>
                <span className="font-medium text-ink-800">
                  {new Date(ex.date).toLocaleDateString('es-VE', { timeZone: 'UTC' })}
                </span>{' '}
                <Badge tone={ex.isBlocked ? 'red' : 'amber'} className="ml-1">
                  {ex.isBlocked ? 'Sin citas' : `${ex.startTime}–${ex.endTime}`}
                </Badge>
                {ex.reason && <p className="mt-0.5 text-ink-500">{ex.reason}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(ex.id)}>
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3 border-t border-ink-100 pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Fecha"
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <Input
            label="Motivo (opcional)"
            placeholder="Vacaciones, congreso médico..."
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.isBlocked}
            onChange={(e) => setForm({ ...form, isBlocked: e.target.checked })}
            className="h-4 w-4 rounded border-ink-300 text-pine-700"
          />
          Bloquear el día completo (sin citas)
        </label>
        {!form.isBlocked && (
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        )}
        <Button type="submit" loading={submitting}>
          Agregar
        </Button>
      </form>
    </div>
  );
}
