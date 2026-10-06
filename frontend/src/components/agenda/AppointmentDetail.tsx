'use client';

import Link from 'next/link';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useRealtimeRefresh } from '@/lib/realtime';
import {
  type AppointmentDetail as Detail,
  eventText,
  isActive,
  patientDisplay,
  SOURCE_LABELS,
  STATUS_INFO,
} from '@/lib/agenda';
import { capitalizeFirst, caracasDateKey, caracasInstant, formatDateTime, formatTime } from '@/lib/dates';
import { ALL_SCOPES } from '@/lib/patient-scopes';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { SlotPicker } from './SlotPicker';

const when = (iso: string) => formatDateTime(iso, { dateStyle: 'full', timeStyle: 'short' });
const whatsappUrl = (phone: string) => {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits.startsWith('58') ? digits : `58${digits.replace(/^0/, '')}`}`;
};

type Mode = 'view' | 'move' | 'cancel';

/**
 * Detalle de una cita del médico: el paciente según lo que autorizó, el
 * motivo (solo aquí, nunca en la cuadrícula), las acciones y su historial.
 * «Mover» es la alternativa a arrastrar: día en el calendario y hora libre,
 * o una hora fuera del horario de atención.
 */
export function AppointmentDetail({
  appointmentId,
  onClose,
  onChanged,
  onLoaded,
}: {
  appointmentId: string;
  onClose: () => void;
  onChanged: (message: string) => void;
  onLoaded?: (detail: Detail) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('view');
  const [slot, setSlot] = useState<string | null>(null);
  const [outside, setOutside] = useState({ enabled: false, date: '', time: '' });
  const [cancelReason, setCancelReason] = useState('');
  const [accessRequested, setAccessRequested] = useState(false);
  // La hora de abrir el detalle: decide si la cita todavía se puede mover.
  const [openedAt] = useState(() => Date.now());

  // onLoaded se lee al cargar, sin volver a pedir la cita si cambia.
  const loaded = useEffectEvent((value: Detail) => onLoaded?.(value));

  useEffect(() => {
    api.get<Detail>(`/appointments/me/${appointmentId}`).then(
      (value) => {
        setDetail(value);
        loaded(value);
      },
      (e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar la cita'),
    );
  }, [appointmentId]);

  // Si la cita cambia en otro lado mientras está abierta, se actualiza (sin mover el calendario).
  useRealtimeRefresh(['appointments'], () =>
    api.get<Detail>(`/appointments/me/${appointmentId}`).then(setDetail, () => undefined),
  );

  const loadSlots = useCallback(
    (from: string, to: string) =>
      api.get<string[]>(`/appointments/me/slots?from=${from}&to=${to}&excludeId=${appointmentId}`),
    [appointmentId],
  );

  const run = async (request: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await request();
      onChanged(message);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo actualizar la cita');
    } finally {
      setBusy(false);
    }
  };

  const move = () => {
    if (!detail) return;
    if (outside.enabled) {
      if (!outside.date || !outside.time) {
        setError('Elige el día y la hora');
        return;
      }
      const startsAt = caracasInstant(outside.date, outside.time).toISOString();
      void run(() => api.patch(`/appointments/${detail.id}/reschedule`, { startsAt, outsideSchedule: true }), 'Cita movida');
      return;
    }
    if (!slot) {
      setError('Elige un día y una hora libres');
      return;
    }
    void run(() => api.patch(`/appointments/${detail.id}/reschedule`, { startsAt: slot }), 'Cita movida');
  };

  const requestAccess = async () => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/appointments/me/patients/${detail.patient.patientId}/access-request`, { scopes: ALL_SCOPES });
      setAccessRequested(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar la solicitud');
    } finally {
      setBusy(false);
    }
  };

  const title = detail ? `Cita con ${patientDisplay(detail.patient)}` : 'Cita';
  const upcoming = detail ? new Date(detail.startsAt).getTime() > openedAt : false;
  const lastCancellation = detail?.events.filter((e) => e.type === 'CANCELLED').at(-1);

  return (
    <Modal open onClose={onClose} title={title} widthClassName="max-w-2xl">
      {!detail ? (
        error ? <Alert tone="error">{error}</Alert> : <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_INFO[detail.status].tone}>{STATUS_INFO[detail.status].label}</Badge>
            <span className="text-sm text-ink-800">{capitalizeFirst(when(detail.startsAt))}</span>
            <span className="text-sm text-ink-500">· hasta las {formatTime(detail.endsAt)}</span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-ink-500">Paciente</dt>
              <dd className="text-ink-900">
                {detail.patient.name ?? <span className="font-mono">{detail.patient.patientCode}</span>}
                {detail.patient.name && <span className="ml-1 font-mono text-xs text-ink-500">{detail.patient.patientCode}</span>}
              </dd>
              {detail.patient.access === 'WALK_IN' && <p className="text-xs text-ink-500">Ficha que cargaste tú</p>}
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-ink-500">Contacto</dt>
              <dd className="text-ink-900">
                {detail.patient.phone ? (
                  <span className="flex flex-wrap gap-3">
                    <a href={`tel:${detail.patient.phone}`} className="text-pine-700 underline">
                      {detail.patient.phone}
                    </a>
                    <a href={whatsappUrl(detail.patient.phone)} target="_blank" rel="noopener noreferrer" className="text-pine-700 underline">
                      WhatsApp
                    </a>
                  </span>
                ) : (
                  <span className="text-ink-500">No autorizado</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-ink-500">Canal</dt>
              <dd className="text-ink-900">{SOURCE_LABELS[detail.source]}</dd>
            </div>
            {detail.location && (
              <div>
                <dt className="text-xs font-medium uppercase text-ink-500">Sede</dt>
                <dd className="text-ink-900">{detail.location.name}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase text-ink-500">Motivo de consulta</dt>
              <dd className="whitespace-pre-line text-ink-900">{detail.reason || <span className="text-ink-500">Sin motivo escrito</span>}</dd>
            </div>
          </dl>

          {detail.patient.access === 'NONE' && detail.patient.hasAccount && (
            <div className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
              {accessRequested ? (
                <p>Le pedimos al paciente que te autorice. Te avisaremos cuando responda.</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>El paciente no te ha autorizado a ver su nombre ni su contacto.</p>
                  <Button size="sm" variant="outline" loading={busy} onClick={requestAccess}>
                    Pedir acceso
                  </Button>
                </div>
              )}
            </div>
          )}

          {mode === 'view' && (
            <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
              {detail.status === 'PENDING' && (
                <Button size="sm" loading={busy} onClick={() => run(() => api.patch(`/appointments/me/${detail.id}/confirm`), 'Cita confirmada')}>
                  Confirmar
                </Button>
              )}
              {detail.status === 'CONFIRMED' && (
                <>
                  <Button size="sm" loading={busy} onClick={() => run(() => api.patch(`/appointments/me/${detail.id}/complete`), 'Cita marcada como realizada')}>
                    Realizada
                  </Button>
                  <Button size="sm" variant="outline" loading={busy} onClick={() => run(() => api.patch(`/appointments/me/${detail.id}/no-show`), 'Cita marcada como «no asistió»')}>
                    No asistió
                  </Button>
                </>
              )}
              {isActive(detail) && upcoming && (
                <Button size="sm" variant="outline" onClick={() => { setMode('move'); setError(null); }}>
                  Mover
                </Button>
              )}
              {isActive(detail) && (
                <Button size="sm" variant="ghost" onClick={() => { setMode('cancel'); setError(null); }}>
                  Cancelar cita
                </Button>
              )}
              <Link
                href={`/dashboard/agenda/historial?paciente=${detail.patient.patientId}`}
                className="ml-auto self-center text-sm font-medium text-pine-700 hover:underline"
              >
                Historial del paciente
              </Link>
            </div>
          )}

          {mode === 'move' && (
            <section aria-labelledby="mover-cita" className="space-y-3 border-t border-ink-100 pt-4">
              <h3 id="mover-cita" className="text-sm font-semibold text-ink-900">Mover la cita</h3>
              {!outside.enabled ? (
                <SlotPicker loadSlots={loadSlots} selectedSlot={slot} onSelectSlot={setSlot} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Día" type="date" min={caracasDateKey(openedAt)} value={outside.date} onChange={(e) => setOutside({ ...outside, date: e.target.value })} />
                  <Input label="Hora" type="time" step={900} value={outside.time} onChange={(e) => setOutside({ ...outside, time: e.target.value })} />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={outside.enabled}
                  onChange={(e) => setOutside({ ...outside, enabled: e.target.checked })}
                />
                Ponerla fuera de mi horario de atención (nunca encima de otra cita)
              </label>
              <p className="text-xs text-ink-500">Le avisaremos al paciente del cambio.</p>
              <div className="flex gap-2">
                <Button size="sm" loading={busy} onClick={move}>
                  Guardar el cambio
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode('view')}>
                  Volver
                </Button>
              </div>
            </section>
          )}

          {mode === 'cancel' && (
            <section aria-labelledby="cancelar-cita" className="space-y-3 border-t border-ink-100 pt-4">
              <h3 id="cancelar-cita" className="text-sm font-semibold text-ink-900">Cancelar la cita</h3>
              <Textarea
                label="Motivo (opcional, lo verá el paciente)"
                rows={2}
                maxLength={500}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy}
                  onClick={() =>
                    run(
                      () => api.patch(`/appointments/${detail.id}/cancel`, { cancellationReason: cancelReason.trim() || undefined }),
                      'Cita cancelada',
                    )
                  }
                >
                  Cancelar la cita
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode('view')}>
                  Volver
                </Button>
              </div>
            </section>
          )}

          <section aria-labelledby="historial-cita" className="border-t border-ink-100 pt-4">
            <h3 id="historial-cita" className="mb-2 text-sm font-semibold text-ink-900">Historial de la cita</h3>
            <ol className="space-y-2">
              {detail.events.map((event, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span aria-hidden="true" className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-pine-600" />
                  <div>
                    <p className="text-ink-900">
                      {eventText(event)}
                      {event.type === 'RESCHEDULED' && event.previousStartsAt && event.newStartsAt && (
                        <span className="text-ink-600">: de {when(event.previousStartsAt)} a {when(event.newStartsAt)}</span>
                      )}
                      {event.outsideSchedule && <span className="text-ink-600"> (fuera del horario de atención)</span>}
                      {event === lastCancellation && detail.cancellationReason && (
                        <span className="text-ink-600"> — motivo: {detail.cancellationReason}</span>
                      )}
                    </p>
                    <p className="text-xs text-ink-500">{formatDateTime(event.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Modal>
  );
}
