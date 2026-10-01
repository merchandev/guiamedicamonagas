'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { PLAN_TIER_LABELS } from '@/lib/labels';

type Level = 'NONE' | 'BASIC' | 'FULL' | 'ADVANCED';
type Counts = Record<string, number>;
interface AppointmentCounts {
  total: number;
  byStatus: Record<string, number>;
}
interface Stats {
  level: Level;
  planTier: string;
  periodDays?: number;
  events?: { total: Counts; last30: Counts; previous30?: Counts };
  appointments?: { last30: AppointmentCounts; previous30?: AppointmentCounts };
  messages?: { last30: number; previous30?: number };
  monthly?: { month: string; events: Counts; appointments: number }[];
}

const EVENT_LABELS: Record<string, string> = {
  PROFILE_VIEW: 'Visitas a tu ficha',
  WHATSAPP_CLICK: 'Clics en WhatsApp',
  PHONE_CLICK: 'Clics en tu teléfono',
  SOCIAL_LINK_CLICK: 'Clics en tus redes y web',
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Por confirmar',
  CONFIRMED: 'Confirmadas',
  COMPLETED: 'Realizadas',
  CANCELLED: 'Canceladas',
  NO_SHOW: 'No asistió',
};
const LEVEL_TEXT: Record<Exclude<Level, 'NONE'>, string> = {
  BASIC: 'Estadísticas básicas',
  FULL: 'Estadísticas completas',
  ADVANCED: 'Analítica avanzada',
};

const monthLabel = (month: string) => {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('es-VE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** Variación frente a los 30 días anteriores (solo analítica avanzada). */
function Trend({ now, before }: { now: number; before?: number }) {
  if (before === undefined) return null;
  if (before === 0) return <p className="mt-1 text-xs text-ink-500">{now > 0 ? 'Sin datos del periodo anterior' : 'Igual que el periodo anterior'}</p>;
  const change = Math.round(((now - before) / before) * 100);
  const tone = change > 0 ? 'text-pine-700' : change < 0 ? 'text-red-700' : 'text-ink-500';
  return (
    <p className={`mt-1 text-xs ${tone}`}>
      {change > 0 ? `▲ ${change} %` : change < 0 ? `▼ ${Math.abs(change)} %` : 'Igual'} frente a los 30 días anteriores
    </p>
  );
}

function Tile({ label, value, total, before }: { label: string; value: number; total?: number; before?: number }) {
  return (
    <div className="rounded-lg bg-ink-50 p-4">
      <p className="text-2xl font-semibold text-ink-900">{value}</p>
      <p className="text-xs text-ink-600">{label}</p>
      {total !== undefined && <p className="mt-1 text-xs text-ink-500">Desde el inicio: {total}</p>}
      <Trend now={value} before={before} />
    </div>
  );
}

export default function DoctorStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Stats>('/analytics/me')
      .then(setStats)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus estadísticas.'));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!stats) return <PageSpinner />;

  const plan = PLAN_TIER_LABELS[stats.planTier]?.label ?? stats.planTier;

  if (stats.level === 'NONE') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl">Estadísticas</h1>
        <div className="card space-y-3 p-6">
          <p className="text-ink-700">
            Tu plan actual ({plan}) no incluye estadísticas. Desde el plan Profesional ves cuántas personas visitan tu ficha
            y te contactan por WhatsApp o teléfono.
          </p>
          <Link href="/dashboard/pagos">
            <Button>Ver planes</Button>
          </Link>
        </div>
      </div>
    );
  }

  const events = stats.events!;
  const eventKeys = Object.keys(events.last30);
  const advanced = stats.level === 'ADVANCED';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Estadísticas</h1>
        <p className="mt-1 text-sm text-ink-600">
          {LEVEL_TEXT[stats.level]} · plan {plan} · últimos {stats.periodDays} días
        </p>
        <p className="mt-1 text-xs text-ink-500">
          Visitas y clics son conteos anónimos de quienes aceptaron la analítica del sitio. Las citas y los mensajes salen de tu
          agenda y de tu bandeja.
        </p>
      </div>

      <section className="card p-6" aria-labelledby="st-contactos">
        <h2 id="st-contactos" className="text-lg font-semibold text-ink-900">
          Visitas y contactos
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {eventKeys.map((key) => (
            <Tile key={key} label={EVENT_LABELS[key] ?? key} value={events.last30[key] ?? 0} total={events.total[key] ?? 0} before={events.previous30?.[key]} />
          ))}
          {stats.messages && <Tile label="Mensajes recibidos" value={stats.messages.last30} before={stats.messages.previous30} />}
        </div>
      </section>

      {stats.appointments && (
        <section className="card p-6" aria-labelledby="st-citas">
          <h2 id="st-citas" className="text-lg font-semibold text-ink-900">
            Citas pedidas
          </h2>
          <p className="text-xs text-ink-500">Por fecha en que se pidieron, con su estado actual.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Citas pedidas" value={stats.appointments.last30.total} before={stats.appointments.previous30?.total} />
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <Tile key={status} label={label} value={stats.appointments!.last30.byStatus[status] ?? 0} />
            ))}
          </div>
        </section>
      )}

      {advanced && stats.monthly && (
        <section className="card p-6" aria-labelledby="st-meses">
          <h2 id="st-meses" className="text-lg font-semibold text-ink-900">
            Últimos 6 meses
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-ink-100 text-ink-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Mes</th>
                  {eventKeys.map((key) => (
                    <th key={key} className="py-2 pr-4 font-medium">
                      {EVENT_LABELS[key] ?? key}
                    </th>
                  ))}
                  <th className="py-2 font-medium">Citas pedidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {stats.monthly.map((row) => (
                  <tr key={row.month}>
                    <td className="py-2 pr-4 capitalize text-ink-700">{monthLabel(row.month)}</td>
                    {eventKeys.map((key) => (
                      <td key={key} className="py-2 pr-4 font-medium text-ink-900">
                        {row.events[key] ?? 0}
                      </td>
                    ))}
                    <td className="py-2 font-medium text-ink-900">{row.appointments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!advanced && (
        <p className="text-sm text-ink-600">
          {stats.level === 'BASIC'
            ? 'Con el plan Plus ves también los clics en tus redes, los mensajes y las citas. '
            : ''}
          Con Premium o Marca Médica ves la comparación con los 30 días anteriores y los últimos 6 meses.{' '}
          <Link href="/dashboard/pagos" className="font-medium text-pine-700 underline">
            Ver planes
          </Link>
        </p>
      )}
    </div>
  );
}
