import { describe, expect, it } from 'vitest';
import { computeAvailableSlots, planDays, withinOpenHours } from '../../src/appointments/availability.util';

// Lunes a domingo de 08:00 a 12:00 (hora de Caracas = UTC-4) y citas de 30 min.
const schedule = (exceptions: { id?: string; date: Date; isBlocked: boolean; startTime: string | null; endTime: string | null; reason?: string | null }[] = []) => ({
  slotDurationMinutes: 30,
  bufferMinutes: 0,
  maxDailyAppointments: null,
  blocks: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '08:00', endTime: '12:00' })),
  exceptions,
});
const longAgo = new Date('2026-01-01T00:00:00Z');
const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe('calendario de la agenda', () => {
  it('un tramo bloqueado parte el horario del día y queda con su motivo', () => {
    const [day] = planDays(
      schedule([{ id: 'x1', date: new Date('2026-10-05'), isBlocked: true, startTime: '09:00', endTime: '10:00', reason: 'Junta médica' }]),
      '2026-10-05',
      '2026-10-05',
    );
    expect(day.open.map((p) => [p.start.toISOString(), p.end.toISOString()])).toEqual([
      ['2026-10-05T12:00:00.000Z', '2026-10-05T13:00:00.000Z'],
      ['2026-10-05T14:00:00.000Z', '2026-10-05T16:00:00.000Z'],
    ]);
    expect(day.blocked).toEqual([
      expect.objectContaining({ id: 'x1', allDay: false, reason: 'Junta médica', start: new Date('2026-10-05T13:00:00Z') }),
    ]);
    const slots = computeAvailableSlots(schedule([{ date: new Date('2026-10-05'), isBlocked: true, startTime: '09:00', endTime: '10:00' }]), [], '2026-10-05', '2026-10-05', longAgo);
    expect(iso(slots)).not.toContain('2026-10-05T13:00:00.000Z');
    expect(iso(slots)).not.toContain('2026-10-05T13:30:00.000Z');
    expect(slots).toHaveLength(6);
  });

  it('un horario especial reemplaza al semanal ese día; un día bloqueado no tiene horario', () => {
    const plan = planDays(
      schedule([
        { date: new Date('2026-10-05'), isBlocked: false, startTime: '14:00', endTime: '15:00' },
        { date: new Date('2026-10-06'), isBlocked: true, startTime: null, endTime: null, reason: 'Vacaciones' },
      ]),
      '2026-10-05',
      '2026-10-06',
    );
    expect(plan[0].special).toBe(true);
    expect(plan[0].open.map((p) => p.start.toISOString())).toEqual(['2026-10-05T18:00:00.000Z']);
    expect(plan[1].open).toEqual([]);
    expect(plan[1].blocked[0]).toMatchObject({ allDay: true, reason: 'Vacaciones' });
  });

  it('una cita fuera de la cuadrícula ocupa los horarios que pisa', () => {
    // 10:15–10:45 pisa los horarios de 10:00 y 10:30.
    const odd = { startsAt: new Date('2026-10-05T14:15:00Z'), endsAt: new Date('2026-10-05T14:45:00Z') };
    const slots = iso(computeAvailableSlots(schedule(), [odd], '2026-10-05', '2026-10-05', longAgo));
    expect(slots).not.toContain('2026-10-05T14:00:00.000Z');
    expect(slots).not.toContain('2026-10-05T14:30:00.000Z');
    expect(slots).toContain('2026-10-05T15:00:00.000Z');
  });

  it('la antelación mínima del paciente deja fuera los horarios demasiado cercanos', () => {
    const earliest = new Date('2026-10-05T13:00:00Z'); // 09:00 en Caracas
    const slots = iso(computeAvailableSlots(schedule(), [], '2026-10-05', '2026-10-05', earliest));
    expect(slots[0]).toBe('2026-10-05T13:30:00.000Z');
  });

  it('sabe si una hora cae dentro del horario de atención', () => {
    const [day] = planDays(schedule(), '2026-10-05', '2026-10-05');
    expect(withinOpenHours(day, new Date('2026-10-05T12:00:00Z'), new Date('2026-10-05T12:30:00Z'))).toBe(true);
    expect(withinOpenHours(day, new Date('2026-10-05T16:00:00Z'), new Date('2026-10-05T16:30:00Z'))).toBe(false);
  });
});
