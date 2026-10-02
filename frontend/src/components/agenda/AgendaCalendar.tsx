'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import esLocale from '@fullcalendar/core/locales/es';
import type {
  AllowFunc,
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core';
import { api, ApiError } from '@/lib/api';
import {
  type AgendaAppointment,
  type CalendarData,
  isActive,
  patientDisplay,
  STATUS_INFO,
} from '@/lib/agenda';
import { caracasDateKey, formatDateTime, formatTime, fromCaracasWall, toCaracasWall } from '@/lib/dates';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { AppointmentDetail } from './AppointmentDetail';

/** «2026-10-05» del día siguiente (fechas de calendario, sin zona). */
const nextDateKey = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};
const wallDateKey = (wall: Date) => wall.toISOString().slice(0, 10);
const wallTime = (wall: Date) => wall.toISOString().slice(11, 16);
const when = (instant: Date) => formatDateTime(instant, { dateStyle: 'full', timeStyle: 'short' });

interface PendingMove {
  appointment: AgendaAppointment;
  start: Date;
  outside: boolean;
  revert: () => void;
}

interface Selection {
  start: Date;
  end: Date;
  allDay: boolean;
  dateKey: string;
}

/**
 * Calendario del médico (día, semana, mes y lista), en hora de Caracas sea
 * cual sea la zona del navegador. Arrastrar una cita la mueve (con
 * confirmación); seleccionar un espacio libre permite cargar una cita o
 * bloquear ese horario. Todo tiene alternativa sin arrastrar: «Mover» en el
 * detalle de cada cita, la vista Lista y el formulario de días bloqueados.
 */
export function AgendaCalendar({ initialAppointmentId }: { initialAppointmentId?: string | null }) {
  const calendarRef = useRef<FullCalendar>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<CalendarData | null>(null);
  // Cuándo llegaron los datos: las citas ya pasadas no se pueden arrastrar.
  const [loadedAt, setLoadedAt] = useState(0);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(initialAppointmentId ?? null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveOutsideOk, setMoveOutsideOk] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [blockToRemove, setBlockToRemove] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [narrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [goToMonth, setGoToMonth] = useState(() => caracasDateKey(Date.now()).slice(0, 7));

  const load = useCallback((from: string, to: string) => {
    rangeRef.current = { from, to };
    return api.get<CalendarData>(`/appointments/me/calendar?from=${from}&to=${to}`).then(
      (loaded) => {
        // Una respuesta vieja (de otra semana) no pisa la vista actual.
        if (rangeRef.current?.from === from && rangeRef.current?.to === to) {
          setData(loaded);
          setLoadedAt(Date.now());
        }
      },
      (e) => {
        if (e instanceof ApiError && e.status === 403) setLocked(true);
        else setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu agenda');
      },
    );
  }, []);

  const reload = useCallback(() => {
    if (rangeRef.current) void load(rangeRef.current.from, rangeRef.current.to);
  }, [load]);

  const onDatesSet = (arg: DatesSetArg) => {
    // Las flechas de la barra son decorativas: el botón ya se llama «Anterior»/«Siguiente».
    wrapperRef.current?.querySelectorAll('.fc-icon').forEach((icon) => icon.setAttribute('aria-hidden', 'true'));
    // Con timeZone UTC, el rango llega en «hora de pared» de Caracas; el fin es exclusivo.
    const from = wallDateKey(arg.start);
    const to = wallDateKey(new Date(arg.end.getTime() - 1));
    // El mes de la fecha que el calendario tiene «en foco» (en una semana entre
    // dos meses, el de hoy o el del día al que se fue), no el del primer día visible.
    setGoToMonth(wallDateKey(arg.view.calendar.getDate()).slice(0, 7));
    void load(from, to);
  };

  const changed = (text: string) => {
    setMessage(text);
    setError(null);
    reload();
  };

  // Al abrir desde un aviso (?cita=…) el calendario va al día de esa cita.
  const onDetailLoaded = useCallback((detail: AgendaAppointment) => {
    calendarRef.current?.getApi().gotoDate(toCaracasWall(detail.startsAt));
  }, []);

  /** El intervalo cae en un horario de atención y coincide con sus horarios. */
  const fitsSchedule = useCallback(
    (start: Date, end: Date) => {
      if (!data?.settings) return false;
      const day = data.days.find((d) => d.date === caracasDateKey(start));
      const stepMs = (data.settings.slotDurationMinutes + data.settings.bufferMinutes) * 60_000;
      return !!day?.open.some((period) => {
        const periodStart = new Date(period.start).getTime();
        return start.getTime() >= periodStart && end.getTime() <= new Date(period.end).getTime() && (start.getTime() - periodStart) % stepMs === 0;
      });
    },
    [data],
  );

  const events = useMemo<EventInput[]>(() => {
    if (!data) return [];
    const list: EventInput[] = [];
    for (const day of data.days) {
      for (const period of day.open) {
        list.push({ start: toCaracasWall(period.start), end: toCaracasWall(period.end), display: 'background', classNames: ['gmm-open'] });
      }
      for (const block of day.blocked) {
        list.push({
          id: block.id ? `bloqueo-${block.id}` : undefined,
          title: block.reason ?? 'Bloqueado',
          display: 'background',
          classNames: ['gmm-blocked'],
          ...(block.allDay
            ? { start: day.date, end: nextDateKey(day.date), allDay: true }
            : { start: toCaracasWall(block.start), end: toCaracasWall(block.end) }),
          extendedProps: { kind: 'block', blockId: block.id, reason: block.reason, allDay: block.allDay, startIso: block.start, endIso: block.end },
        });
      }
    }
    const now = loadedAt;
    for (const appointment of data.appointments) {
      if (appointment.status === 'CANCELLED' && !showCancelled) continue;
      const info = STATUS_INFO[appointment.status];
      list.push({
        id: appointment.id,
        title: patientDisplay(appointment.patient),
        start: toCaracasWall(appointment.startsAt),
        end: toCaracasWall(appointment.endsAt),
        backgroundColor: info.color,
        borderColor: info.color,
        textColor: info.text,
        startEditable: isActive(appointment) && new Date(appointment.startsAt).getTime() > now,
        classNames: appointment.status === 'CANCELLED' ? ['gmm-cancelled'] : [],
        extendedProps: { kind: 'appointment', appointment },
      });
    }
    return list;
  }, [data, showCancelled, loadedAt]);

  // Horas visibles: el horario de atención y las citas del rango, con margen.
  const { slotMinTime, slotMaxTime } = useMemo(() => {
    let min = 7 * 60;
    let max = 19 * 60;
    const minutes = (iso: string) => {
      const wall = toCaracasWall(iso);
      return wall.getUTCHours() * 60 + wall.getUTCMinutes();
    };
    for (const day of data?.days ?? []) {
      for (const p of day.open) {
        min = Math.min(min, minutes(p.start));
        max = Math.max(max, minutes(p.end) || 24 * 60);
      }
    }
    for (const a of data?.appointments ?? []) {
      min = Math.min(min, minutes(a.startsAt));
      max = Math.max(max, minutes(a.endsAt) || 24 * 60);
    }
    const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:00:00`;
    return { slotMinTime: toTime(Math.max(0, Math.floor(min / 60) * 60 - 60)), slotMaxTime: toTime(Math.min(24 * 60, Math.ceil(max / 60) * 60 + 60)) };
  }, [data]);

  const notPast: AllowFunc = (span) => fromCaracasWall(span.start).getTime() > Date.now();

  const onDrop = (info: EventDropArg) => {
    const appointment = info.event.extendedProps.appointment as AgendaAppointment | undefined;
    if (!appointment || !info.event.start) {
      info.revert();
      return;
    }
    const start = fromCaracasWall(info.event.start);
    const end = new Date(start.getTime() + (new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()));
    setMoveOutsideOk(false);
    setPendingMove({ appointment, start, outside: !fitsSchedule(start, end), revert: info.revert });
  };

  const confirmMove = async () => {
    if (!pendingMove) return;
    setBusy(true);
    try {
      await api.patch(`/appointments/${pendingMove.appointment.id}/reschedule`, {
        startsAt: pendingMove.start.toISOString(),
        ...(pendingMove.outside ? { outsideSchedule: true } : {}),
      });
      setPendingMove(null);
      changed('Cita movida. Le avisamos al paciente.');
    } catch (e) {
      pendingMove.revert();
      setPendingMove(null);
      setError(e instanceof ApiError ? e.message : 'No se pudo mover la cita');
    } finally {
      setBusy(false);
    }
  };

  const cancelMove = () => {
    pendingMove?.revert();
    setPendingMove(null);
  };

  const onSelect = (info: DateSelectArg) => {
    const start = info.allDay ? new Date(`${info.startStr.slice(0, 10)}T00:00:00Z`) : fromCaracasWall(info.start);
    const end = info.allDay ? new Date(`${info.endStr.slice(0, 10)}T00:00:00Z`) : fromCaracasWall(info.end);
    setSelection({ start, end, allDay: info.allDay, dateKey: info.allDay ? info.startStr.slice(0, 10) : caracasDateKey(start) });
  };

  const closeSelection = () => {
    setSelection(null);
    calendarRef.current?.getApi().unselect();
  };

  const onEventClick = (info: EventClickArg) => {
    const kind = info.event.extendedProps.kind;
    if (kind === 'appointment') {
      setDetailId(info.event.id);
    } else if (kind === 'block' && info.event.extendedProps.blockId) {
      const props = info.event.extendedProps;
      const label = props.allDay
        ? `el día ${formatDateTime(`${info.event.startStr.slice(0, 10)}T12:00:00Z`, { dateStyle: 'full' })}`
        : `de ${formatTime(props.startIso)} a ${formatTime(props.endIso)} del ${formatDateTime(props.startIso, { dateStyle: 'full' })}`;
      setBlockToRemove({ id: props.blockId, label: `${label}${props.reason ? ` (${props.reason})` : ''}` });
    }
  };

  const removeBlock = async () => {
    if (!blockToRemove) return;
    setBusy(true);
    try {
      await api.delete(`/agenda/me/exceptions/${blockToRemove.id}`);
      setBlockToRemove(null);
      changed('Bloqueo quitado');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo quitar el bloqueo');
      setBlockToRemove(null);
    } finally {
      setBusy(false);
    }
  };

  const renderEvent = (arg: EventContentArg) => {
    const appointment = arg.event.extendedProps.appointment as AgendaAppointment | undefined;
    if (!appointment) {
      return arg.event.display === 'background' && arg.event.title ? (
        <span className="block truncate px-1 pt-0.5 text-[11px] font-medium text-ink-700">{arg.event.title}</span>
      ) : null;
    }
    // Una sola línea: el estado se ve por el color (y la leyenda) y se lee en
    // voz alta; una segunda línea se salía de las citas cortas.
    return (
      <div className="truncate px-1 text-[11px] leading-tight" title={`${arg.event.title} · ${STATUS_INFO[appointment.status].label}`}>
        <span className="font-semibold">{arg.timeText}</span> {arg.event.title}
        <span className="sr-only">, {STATUS_INFO[appointment.status].label}</span>
      </div>
    );
  };

  const goTo = (month: string) => {
    setGoToMonth(month);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const api$ = calendarRef.current?.getApi();
    api$?.changeView('dayGridMonth');
    api$?.gotoDate(`${month}-01`);
  };

  // Cerrar el detalle quita ?cita= de la dirección (sin recargar).
  useEffect(() => {
    if (detailId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('cita')) {
      url.searchParams.delete('cita');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, [detailId]);

  if (locked) {
    return (
      <EmptyState
        title="La agenda es un beneficio desde el plan Profesional"
        description="Actualiza tu plan para recibir citas de pacientes y organizar tu agenda."
        action={
          <Link href="/dashboard/pagos">
            <Button>Ver planes</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {data && !data.settings && (
        <Alert tone="warning">
          Todavía no configuraste tu horario de atención. Hazlo en <Link href="/dashboard/agenda/horario" className="underline">Horario</Link> para recibir reservas.
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-56">
          <Input label="Ir al mes" type="month" value={goToMonth} onChange={(e) => goTo(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          Mostrar las canceladas
        </label>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700" aria-label="Leyenda del calendario">
        {(['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'] as const).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: STATUS_INFO[status].color }} />
            {STATUS_INFO[status].label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="gmm-open-swatch h-3 w-3 rounded-sm" />
          Horario de atención
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="gmm-blocked-swatch h-3 w-3 rounded-sm" />
          Bloqueado
        </li>
      </ul>

      <div ref={wrapperRef} className="gmm-calendar card overflow-hidden p-2 sm:p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          locale={esLocale}
          timeZone="UTC"
          now={() => toCaracasWall(Date.now())}
          initialView={narrow ? 'listWeek' : 'timeGridWeek'}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek' }}
          buttonText={{ today: 'Hoy', day: 'Día', week: 'Semana', month: 'Mes', list: 'Lista' }}
          firstDay={1}
          nowIndicator
          height="auto"
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          slotLabelFormat={{ hour: 'numeric', minute: '2-digit', hour12: true }}
          eventTimeFormat={{ hour: 'numeric', minute: '2-digit', hour12: true }}
          displayEventEnd={false}
          allDaySlot
          allDayText="Día"
          dayMaxEvents
          editable
          eventDurationEditable={false}
          selectable
          selectMirror
          eventInteractive
          longPressDelay={400}
          noEventsText="No hay citas en estas fechas"
          events={events}
          datesSet={onDatesSet}
          eventDrop={onDrop}
          eventAllow={notPast}
          select={onSelect}
          selectAllow={(span) => notPast(span, null) && wallDateKey(span.start) === wallDateKey(new Date(span.end.getTime() - 1))}
          eventClick={onEventClick}
          eventContent={renderEvent}
        />
      </div>
      <p className="text-xs text-ink-500">
        Arrastra una cita para moverla, o ábrela y usa «Mover». Toca o arrastra sobre un espacio libre para cargar una cita o
        bloquear ese horario. Las horas son de Caracas.
      </p>

      {detailId && (
        <AppointmentDetail appointmentId={detailId} onClose={() => setDetailId(null)} onChanged={changed} onLoaded={onDetailLoaded} />
      )}

      {pendingMove && (
        <Modal open onClose={cancelMove} title="Mover la cita">
          <div className="space-y-4 text-sm text-ink-800">
            <p>
              ¿Mover la cita de <strong>{patientDisplay(pendingMove.appointment.patient)}</strong> del{' '}
              <span>{when(new Date(pendingMove.appointment.startsAt))}</span> al{' '}
              <strong>{when(pendingMove.start)}</strong>? Le avisaremos al paciente.
            </p>
            {pendingMove.outside && (
              <div className="space-y-2 rounded-lg bg-gold-50 p-3 text-gold-900">
                <p>Ese horario está fuera de tu horario de atención o no coincide con tus horarios de citas.</p>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={moveOutsideOk} onChange={(e) => setMoveOutsideOk(e.target.checked)} />
                  Moverla de todos modos fuera de mi horario
                </label>
              </div>
            )}
            <div className="flex gap-2">
              <Button loading={busy} disabled={pendingMove.outside && !moveOutsideOk} onClick={confirmMove}>
                Mover la cita
              </Button>
              <Button variant="ghost" onClick={cancelMove}>
                No moverla
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {selection && (
        <SelectionDialog
          selection={selection}
          slotMinutes={data?.settings?.slotDurationMinutes ?? 30}
          fits={(start, end) => fitsSchedule(start, end)}
          onClose={closeSelection}
          onDone={(text) => {
            closeSelection();
            changed(text);
          }}
          onShowDay={() => {
            const api$ = calendarRef.current?.getApi();
            api$?.changeView('timeGridDay', selection.dateKey);
            closeSelection();
          }}
        />
      )}

      {blockToRemove && (
        <Modal open onClose={() => setBlockToRemove(null)} title="Quitar el bloqueo">
          <div className="space-y-4 text-sm text-ink-800">
            <p>¿Quitar el bloqueo de {blockToRemove.label}? Esos horarios vuelven a quedar disponibles para reservar.</p>
            <div className="flex gap-2">
              <Button loading={busy} onClick={removeBlock}>
                Quitar el bloqueo
              </Button>
              <Button variant="ghost" onClick={() => setBlockToRemove(null)}>
                Dejarlo
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Qué hacer con un espacio libre: cargar una cita o bloquear ese horario (o el día). */
function SelectionDialog({
  selection,
  slotMinutes,
  fits,
  onClose,
  onDone,
  onShowDay,
}: {
  selection: Selection;
  slotMinutes: number;
  fits: (start: Date, end: Date) => boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  onShowDay: () => void;
}) {
  const [mode, setMode] = useState<'choose' | 'appointment' | 'block'>(selection.allDay ? 'block' : 'choose');
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', reason: '' });
  const [blockReason, setBlockReason] = useState('');
  const [outsideOk, setOutsideOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appointmentEnd = new Date(selection.start.getTime() + slotMinutes * 60_000);
  const outside = !selection.allDay && !fits(selection.start, appointmentEnd);
  const wallStart = toCaracasWall(selection.start);
  const wallEnd = toCaracasWall(selection.end);
  const range = selection.allDay
    ? formatDateTime(`${selection.dateKey}T12:00:00Z`, { dateStyle: 'full' })
    : `${formatDateTime(selection.start, { dateStyle: 'full' })}, de ${formatTime(selection.start)} a ${formatTime(selection.end)}`;

  const submit = async (request: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await request();
      onDone(message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const createAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(
      () =>
        api.post('/appointments/me/manual', {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim() || undefined,
          reason: form.reason.trim() || undefined,
          startsAt: selection.start.toISOString(),
          ...(outside ? { outsideSchedule: true } : {}),
        }),
      'Cita cargada',
    );
  };

  const block = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(
      () =>
        api.post('/agenda/me/exceptions', {
          date: selection.dateKey,
          isBlocked: true,
          ...(selection.allDay ? {} : { startTime: wallTime(wallStart), endTime: wallTime(wallEnd) === '00:00' ? '23:59' : wallTime(wallEnd) }),
          reason: blockReason.trim() || undefined,
        }),
      selection.allDay ? 'Día bloqueado' : 'Horario bloqueado',
    );
  };

  return (
    <Modal open onClose={onClose} title={selection.allDay ? 'Bloquear el día' : 'Espacio libre'}>
      <div className="space-y-4 text-sm text-ink-800">
        <p className="first-letter:uppercase">{range}</p>
        {error && <Alert tone="error">{error}</Alert>}

        {mode === 'choose' && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode('appointment')}>Cargar una cita</Button>
            <Button variant="outline" onClick={() => setMode('block')}>
              Bloquear este horario
            </Button>
          </div>
        )}

        {mode === 'appointment' && (
          <form onSubmit={createAppointment} className="space-y-3">
            <p className="text-xs text-ink-500">
              Para un paciente que te pidió la cita por teléfono o en persona, a las {formatTime(selection.start)} ({slotMinutes} minutos).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Nombre" required maxLength={80} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              <Input label="Apellido" required maxLength={80} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <Input label="Teléfono (opcional)" placeholder="0414-1234567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Textarea label="Motivo (opcional)" rows={2} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            {outside && (
              <label className="flex items-center gap-2 rounded-lg bg-gold-50 p-3 text-gold-900">
                <input type="checkbox" checked={outsideOk} onChange={(e) => setOutsideOk(e.target.checked)} />
                Es fuera de mi horario de atención: cargarla de todos modos
              </label>
            )}
            <div className="flex gap-2">
              <Button type="submit" loading={busy} disabled={outside && !outsideOk}>
                Guardar la cita
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {mode === 'block' && (
          <form onSubmit={block} className="space-y-3">
            <p className="text-xs text-ink-500">
              {selection.allDay
                ? 'Ese día nadie podrá reservar contigo. Las citas que ya tengas no se cancelan.'
                : 'En ese horario nadie podrá reservar contigo. Las citas que ya tengas no se cancelan.'}
            </p>
            <Input label="Motivo (opcional, solo lo ves tú)" maxLength={200} value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy}>
                {selection.allDay ? 'Bloquear el día' : 'Bloquear el horario'}
              </Button>
              {selection.allDay && (
                <Button type="button" variant="outline" onClick={onShowDay}>
                  Ver ese día
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
