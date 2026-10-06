// A quién avisa el canal en tiempo real de cada cambio de la bandeja (sin base de datos).
import { describe, expect, it } from 'vitest';
import {
  type CapturedEvent,
  deliveriesFor,
  emptyLookups,
  groupByRoom,
  lookupNeeds,
  sessionUsersFor,
} from '../../src/realtime/realtime-audience';

const PRO = '11111111-1111-4111-8111-111111111111';
const PATIENT = '22222222-2222-4222-8222-222222222222';
const PATIENT_USER = '33333333-3333-4333-8333-333333333333';
const ROW = '44444444-4444-4444-8444-444444444444';

const event = (source: string, keys: Record<string, unknown>, op = 'INSERT'): CapturedEvent => ({
  id: '1',
  source,
  op,
  rowId: ROW,
  keys,
});

describe('canal en tiempo real: a quién avisar', () => {
  it('una cita avisa al médico, al paciente con cuenta y a quien mira los horarios públicos', () => {
    const lookups = emptyLookups();
    lookups.patientUser.set(PATIENT, PATIENT_USER);
    const out = deliveriesFor(event('Appointment', { professionalId: PRO, patientId: PATIENT }), lookups);
    expect(out).toEqual([
      { room: `pro:${PRO}`, topic: 'appointments', ref: ROW },
      { room: `user:${PATIENT_USER}`, topic: 'appointments', ref: ROW },
      { room: `pub:pro:${PRO}`, topic: 'availability' },
    ]);
  });

  it('las salas públicas nunca reciben el identificador de la fila', () => {
    const lookups = emptyLookups();
    lookups.patientUser.set(PATIENT, PATIENT_USER);
    const all = [
      ...deliveriesFor(event('Appointment', { professionalId: PRO, patientId: PATIENT }), lookups),
      ...deliveriesFor(event('ProfessionalProfile', { id: PRO, userId: PATIENT_USER }), lookups),
      ...deliveriesFor(event('Specialty', {}), lookups),
    ];
    for (const delivery of all.filter((d) => d.room === 'all' || d.room.startsWith('pub:'))) {
      expect(delivery.ref).toBeUndefined();
    }
  });

  it('una ficha de paciente sin cuenta no avisa a nadie como paciente', () => {
    const lookups = emptyLookups();
    lookups.patientUser.set(PATIENT, null);
    const out = deliveriesFor(event('Prescription', { professionalId: PRO, patientId: PATIENT }), lookups);
    expect(out).toEqual([{ room: `pro:${PRO}`, topic: 'prescriptions', ref: ROW }]);
  });

  it('si la cita cambia de paciente, avisa al anterior y al nuevo', () => {
    const lookups = emptyLookups();
    const OTHER = '55555555-5555-4555-8555-555555555555';
    lookups.patientUser.set(PATIENT, PATIENT_USER);
    lookups.patientUser.set(OTHER, 'otro-usuario');
    const out = deliveriesFor(
      event('Appointment', { professionalId: PRO, patientId: OTHER, old_patientId: PATIENT }, 'UPDATE'),
      lookups,
    );
    expect(out.filter((d) => d.room.startsWith('user:')).map((d) => d.room).sort()).toEqual(['user:otro-usuario', `user:${PATIENT_USER}`].sort());
  });

  it('los pagos llegan al dueño del plan a través de la cuota y la suscripción', () => {
    const lookups = emptyLookups();
    lookups.installmentSubscription.set('cuota', 'suscripcion');
    lookups.subscriptionOwner.set('suscripcion', { professionalId: PRO, organizationId: null });
    const out = deliveriesFor(event('Payment', { installmentId: 'cuota' }), lookups);
    expect(out).toContainEqual({ room: `pro:${PRO}`, topic: 'billing', ref: ROW });
    expect(out).toContainEqual({ room: 'staff', topic: 'billing' });
  });

  it('una respuesta a una valoración avisa al médico y al paciente de esa valoración', () => {
    const lookups = emptyLookups();
    lookups.reviewOwner.set('valoracion', { professionalId: PRO, patientId: PATIENT });
    lookups.patientUser.set(PATIENT, PATIENT_USER);
    const out = deliveriesFor(event('ReviewReply', { reviewId: 'valoracion' }), lookups);
    expect(out).toContainEqual({ room: `pro:${PRO}`, topic: 'reviews', ref: ROW });
    expect(out).toContainEqual({ room: `user:${PATIENT_USER}`, topic: 'reviews', ref: ROW });
  });

  it('pide a la base solo lo que hace falta para el lote', () => {
    const needs = lookupNeeds([
      event('Appointment', { professionalId: PRO, patientId: PATIENT }),
      event('ScheduleBlock', { scheduleId: 'horario' }),
      event('Payment', { installmentId: 'cuota' }),
      event('ReviewReport', { reviewId: 'valoracion' }),
      event('Notification', { userId: PATIENT_USER }),
    ]);
    expect([...needs.patientIds]).toEqual([PATIENT]);
    expect([...needs.scheduleIds]).toEqual(['horario']);
    expect([...needs.installmentIds]).toEqual(['cuota']);
    expect([...needs.reviewIds]).toEqual(['valoracion']);
  });

  it('un cambio de cuenta revisa la sesión de esa cuenta; un perfil de médico nuevo, sus salas', () => {
    expect(sessionUsersFor(event('User', { id: PATIENT_USER }, 'UPDATE'))).toEqual([PATIENT_USER]);
    expect(sessionUsersFor(event('ProfessionalProfile', { id: PRO, userId: PATIENT_USER }, 'INSERT'))).toEqual([PATIENT_USER]);
    expect(sessionUsersFor(event('ProfessionalProfile', { id: PRO, userId: PATIENT_USER }, 'UPDATE'))).toEqual([]);
    expect(sessionUsersFor(event('Notification', { userId: PATIENT_USER }))).toEqual([]);
  });

  it('agrupa el lote: un mensaje por sala, sin temas repetidos y con un tope de filas', () => {
    const deliveries = Array.from({ length: 30 }, (_, i) => ({
      room: `pro:${PRO}` as const,
      topic: 'appointments' as const,
      ref: `fila-${i}`,
    }));
    deliveries.push({ room: `pro:${PRO}`, topic: 'appointments', ref: 'fila-0' });
    const messages = groupByRoom([...deliveries, { room: 'all', topic: 'directory' }]);
    expect(messages.get(`pro:${PRO}`)?.topics).toEqual(['appointments']);
    expect(messages.get(`pro:${PRO}`)?.refs?.appointments).toHaveLength(20);
    expect(messages.get('all')).toEqual({ topics: ['directory'] });
  });

  it('las tablas sin interés para nadie no avisan', () => {
    expect(deliveriesFor(event('AuditLog', { userId: PATIENT_USER }), emptyLookups())).toEqual([]);
  });
});
