'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';

interface ScheduleConfig {
  slotDurationMinutes: number;
  bufferMinutes: number;
  maxDailyAppointments: number | null;
  autoConfirm: boolean;
  bookingWindowDays: number;
  minNoticeMinutes: number;
}

const SLOT_OPTIONS = [15, 20, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} minutos` }));
const WINDOW_OPTIONS = [7, 14, 30, 60, 90, 180].map((d) => ({ value: String(d), label: `Hasta ${d} días adelante` }));
const NOTICE_OPTIONS = [
  { value: '0', label: 'Sin mínimo' },
  { value: '30', label: '30 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '120', label: '2 horas antes' },
  { value: '240', label: '4 horas antes' },
  { value: '720', label: '12 horas antes' },
  { value: '1440', label: '1 día antes' },
  { value: '2880', label: '2 días antes' },
];
/** Un valor guardado que no está en la lista también se muestra. */
const withCurrent = (options: { value: string; label: string }[], value: number, label: string) =>
  options.some((o) => o.value === String(value)) ? options : [...options, { value: String(value), label }];

export function ScheduleConfigForm() {
  const [config, setConfig] = useState<ScheduleConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<ScheduleConfig>('/agenda/me')
      .then(setConfig)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setLocked(true);
      });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      // Solo los campos editables: la respuesta de la API trae además id,
      // bloques y excepciones, y reenviarlos hacía fallar el guardado.
      const updated = await api.put<ScheduleConfig>('/agenda/me', {
        slotDurationMinutes: config.slotDurationMinutes,
        bufferMinutes: config.bufferMinutes,
        // null = sin límite diario (vaciar el campo quita el límite).
        maxDailyAppointments: config.maxDailyAppointments,
        autoConfirm: config.autoConfirm,
        bookingWindowDays: config.bookingWindowDays,
        minNoticeMinutes: config.minNoticeMinutes,
      });
      setConfig(updated);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  if (locked) {
    return (
      <EmptyState
        title="La agenda es un beneficio desde el plan Profesional"
        description="Actualiza tu plan para configurar horarios y recibir citas."
        action={
          <Link href="/dashboard/pagos">
            <Button>Ver planes</Button>
          </Link>
        }
      />
    );
  }

  if (!config) return <PageSpinner />;

  return (
    <form onSubmit={save} className="card space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink-900">Configuración de la agenda</h2>
      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">Configuración guardada.</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          label="Duración de cada cita"
          value={String(config.slotDurationMinutes)}
          onChange={(v) => setConfig({ ...config, slotDurationMinutes: Number(v) })}
          options={SLOT_OPTIONS}
        />
        <Input
          label="Tiempo entre citas (min)"
          type="number"
          min={0}
          max={60}
          value={config.bufferMinutes}
          onChange={(e) => setConfig({ ...config, bufferMinutes: Number(e.target.value) })}
        />
        <Input
          label="Máximo de citas al día (opcional)"
          type="number"
          min={1}
          max={100}
          value={config.maxDailyAppointments ?? ''}
          onChange={(e) =>
            setConfig({ ...config, maxDailyAppointments: e.target.value ? Number(e.target.value) : null })
          }
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={config.autoConfirm}
          onChange={(e) => setConfig({ ...config, autoConfirm: e.target.checked })}
          className="h-4 w-4 rounded border-ink-300 text-pine-700"
        />
        Confirmar citas automáticamente (sin revisarlas una por una)
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Los pacientes reservan"
          value={String(config.bookingWindowDays)}
          onChange={(v) => setConfig({ ...config, bookingWindowDays: Number(v) })}
          options={withCurrent(WINDOW_OPTIONS, config.bookingWindowDays, `Hasta ${config.bookingWindowDays} días adelante`)}
        />
        <Select
          label="Antelación mínima de una reserva"
          value={String(config.minNoticeMinutes)}
          onChange={(v) => setConfig({ ...config, minNoticeMinutes: Number(v) })}
          options={withCurrent(NOTICE_OPTIONS, config.minNoticeMinutes, `${config.minNoticeMinutes} minutos antes`)}
        />
      </div>
      <p className="text-xs text-ink-500">
        Estos límites son para las reservas de los pacientes. Tú puedes cargar o mover citas en cualquier momento desde el
        calendario.
      </p>
      <Button type="submit" loading={saving}>
        Guardar
      </Button>
    </form>
  );
}
