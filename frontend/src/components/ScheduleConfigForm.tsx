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
}

const SLOT_OPTIONS = [15, 20, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} minutos` }));

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
      const updated = await api.put<ScheduleConfig>('/agenda/me', config);
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
      <Button type="submit" loading={saving}>
        Guardar
      </Button>
    </form>
  );
}
