'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useRealtimeRefresh } from '@/lib/realtime';
import {
  type AgendaAppointment,
  type AppointmentStatus,
  type HistoryPage,
  patientDisplay,
  SOURCE_LABELS,
  STATUS_INFO,
  STATUS_OPTIONS,
} from '@/lib/agenda';
import { capitalizeFirst, formatDateTime } from '@/lib/dates';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { AppointmentDetail } from './AppointmentDetail';
import { monthRange } from './MonthCalendar';

interface Filters {
  month: string;
  status: string;
  source: string;
  patientCode: string;
}

const EMPTY: Filters = { month: '', status: '', source: '', patientCode: '' };
const SOURCE_OPTIONS = [
  { value: '', label: 'Todos los canales' },
  { value: 'WEB', label: SOURCE_LABELS.WEB },
  { value: 'PHONE', label: SOURCE_LABELS.PHONE },
];

function queryFor(filters: Filters, patientId: string | null, cursor?: string) {
  const params = new URLSearchParams();
  if (filters.month) {
    const { first, last } = monthRange(filters.month);
    params.set('from', first);
    params.set('to', last);
  }
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  if (filters.patientCode.trim()) params.set('patientCode', filters.patientCode.trim());
  if (patientId) params.set('patientId', patientId);
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

/**
 * Historial de citas del médico: de la más reciente a la más vieja, con
 * filtros por mes, estado, canal y paciente. Cada cita abre su detalle con la
 * línea de tiempo. Con ?paciente=… muestra solo ese paciente y sus totales.
 */
export function AppointmentHistory({ patientId }: { patientId: string | null }) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchPage = useCallback(
    (cursor?: string) => api.get<HistoryPage>(`/appointments/me/history?${queryFor(applied, patientId, cursor)}`),
    [applied, patientId],
  );

  useEffect(() => {
    let active = true;
    fetchPage().then(
      (result) => {
        if (active) setPage(result);
      },
      (e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 403) setLocked(true);
        else setError(e instanceof ApiError ? e.message : 'No se pudo cargar el historial');
      },
    );
    return () => {
      active = false;
    };
  }, [fetchPage, version]);

  useRealtimeRefresh(['appointments'], () => setVersion((v) => v + 1));

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(null);
    setError(null);
    setApplied({ ...filters });
  };

  const clear = () => {
    setFilters(EMPTY);
    setPage(null);
    setApplied(EMPTY);
  };

  const loadMore = () => {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    fetchPage(page.nextCursor)
      .then(
        (next) => setPage((current) => ({ items: [...(current?.items ?? []), ...next.items], nextCursor: next.nextCursor, summary: current?.summary ?? null })),
        () => setError('No se pudieron cargar más citas'),
      )
      .finally(() => setLoadingMore(false));
  };

  if (locked) {
    return (
      <EmptyState
        title="El historial es parte de la agenda, desde el plan Profesional"
        description="Actualiza tu plan para recibir citas de pacientes y llevar su historial."
        action={
          <Link href="/dashboard/pagos">
            <Button>Ver planes</Button>
          </Link>
        }
      />
    );
  }

  const patient = patientId ? page?.items[0]?.patient : null;

  return (
    <div className="space-y-5">
      {message && <Alert tone="success">{message}</Alert>}
      {patientId && (
        <div className="card space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink-900">
              Citas con {patient ? patientDisplay(patient) : 'este paciente'}
            </h2>
            <Link href="/dashboard/agenda/historial" className="text-sm font-medium text-pine-700 hover:underline">
              Ver todas las citas
            </Link>
          </div>
          {page?.summary && (
            <ul className="flex flex-wrap gap-2 text-sm">
              {(Object.keys(STATUS_INFO) as AppointmentStatus[]).map((status) => (
                <li key={status}>
                  <Badge tone={STATUS_INFO[status].tone}>
                    {STATUS_INFO[status].label}: {page.summary![status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form onSubmit={apply} className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
        <Input label="Mes" type="month" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} />
        <Select
          label="Estado"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v })}
          options={[{ value: '', label: 'Todos los estados' }, ...STATUS_OPTIONS]}
        />
        <Select label="Canal" value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} options={SOURCE_OPTIONS} />
        <Input
          label="Código del paciente"
          placeholder="GMM-A4F2"
          maxLength={20}
          value={filters.patientCode}
          onChange={(e) => setFilters({ ...filters, patientCode: e.target.value })}
        />
        <div className="flex gap-2">
          <Button type="submit">Filtrar</Button>
          <Button type="button" variant="ghost" onClick={clear}>
            Limpiar
          </Button>
        </div>
      </form>

      {error && <Alert tone="error">{error}</Alert>}

      {!page ? (
        !error && <PageSpinner />
      ) : page.items.length === 0 ? (
        <EmptyState title="No hay citas con estos filtros" description="Prueba con otro mes o quita los filtros." />
      ) : (
        <div className="card divide-y divide-ink-100">
          {page.items.map((appointment: AgendaAppointment) => (
            <button
              key={appointment.id}
              type="button"
              onClick={() => setDetailId(appointment.id)}
              className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-ink-50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-900">
                  {capitalizeFirst(formatDateTime(appointment.startsAt, { dateStyle: 'full', timeStyle: 'short' }))}
                </span>
                <span className="block text-sm text-ink-700">
                  {patientDisplay(appointment.patient)}
                  {appointment.patient.name && <span className="ml-1 font-mono text-xs text-ink-500">{appointment.patient.patientCode}</span>}
                </span>
                <span className="block text-xs text-ink-500">
                  {SOURCE_LABELS[appointment.source]}
                  {appointment.location && ` · ${appointment.location.name}`}
                </span>
              </span>
              <Badge tone={STATUS_INFO[appointment.status].tone}>{STATUS_INFO[appointment.status].label}</Badge>
            </button>
          ))}
          {page.nextCursor && (
            <div className="p-4 text-center">
              <Button variant="ghost" size="sm" loading={loadingMore} onClick={loadMore}>
                Ver más citas
              </Button>
            </div>
          )}
        </div>
      )}

      {detailId && (
        <AppointmentDetail
          appointmentId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={(text) => {
            setMessage(text);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
