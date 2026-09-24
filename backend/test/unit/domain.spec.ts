import { describe, expect, it } from 'vitest';
import {
  caracasOffsetMinutes,
  combineDateAndTime,
  computeAvailableSlots,
  endOfCaracasDay,
  startOfCaracasDay,
  toVetDateKey,
} from '../../src/appointments/availability.util';
import { Permission, roleHasPermissions, ROLE_PERMISSIONS } from '../../src/common/permissions';
import { computeCompleteness, PLAN_BOOST } from '../../src/professionals/directory-score';
import { shapeForScopes } from '../../src/patients/patients.service';
import { EMPTY_HEALTH_DATA } from '../../src/patients/patient-data.codec';

describe('agenda en America/Caracas', () => {
  it('Caracas es UTC-4', () => {
    expect(caracasOffsetMinutes(new Date('2026-09-23T12:00:00Z'))).toBe(-240);
  });

  it('08:00 en Caracas = 12:00 UTC y el día se calcula en Caracas', () => {
    expect(combineDateAndTime('2026-09-23', '08:00').toISOString()).toBe('2026-09-23T12:00:00.000Z');
    expect(toVetDateKey(new Date('2026-09-24T02:30:00Z'))).toBe('2026-09-23');
    expect(startOfCaracasDay('2026-09-23').toISOString()).toBe('2026-09-23T04:00:00.000Z');
    expect(endOfCaracasDay('2026-09-23').toISOString()).toBe('2026-09-24T03:59:59.999Z');
  });

  const schedule = (exceptions: { date: Date; isBlocked: boolean; startTime: string | null; endTime: string | null }[] = []) => ({
    slotDurationMinutes: 30,
    bufferMinutes: 0,
    maxDailyAppointments: null,
    blocks: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '08:00', endTime: '10:00' })),
    exceptions,
  });
  const now = new Date('2026-01-01T00:00:00Z');

  it('genera los cupos del bloque', () => {
    const slots = computeAvailableSlots(schedule(), [], '2026-10-01', '2026-10-01', now);
    expect(slots.map((s) => s.toISOString())).toEqual([
      '2026-10-01T12:00:00.000Z',
      '2026-10-01T12:30:00.000Z',
      '2026-10-01T13:00:00.000Z',
      '2026-10-01T13:30:00.000Z',
    ]);
  });

  it('una excepción bloquea SU día, no el anterior (fecha guardada a medianoche UTC)', () => {
    const blocked = schedule([{ date: new Date('2026-10-02'), isBlocked: true, startTime: null, endTime: null }]);
    const slots = computeAvailableSlots(blocked, [], '2026-10-01', '2026-10-02', now);
    expect(slots.every((s) => toVetDateKey(s) === '2026-10-01')).toBe(true);
    expect(slots).toHaveLength(4);
  });

  it('excluye cupos ocupados y pasados', () => {
    const taken = [new Date('2026-10-01T12:00:00Z')];
    const slots = computeAvailableSlots(schedule(), taken, '2026-10-01', '2026-10-01', new Date('2026-10-01T12:45:00Z'));
    expect(slots.map((s) => s.toISOString())).toEqual(['2026-10-01T13:00:00.000Z', '2026-10-01T13:30:00.000Z']);
  });
});

describe('permisos (SEC-03)', () => {
  it('ADMIN opera verificación y pagos pero no precios ni SEO', () => {
    expect(roleHasPermissions('ADMIN', [Permission.VERIFY_PROFESSIONALS, Permission.REVIEW_PAYMENTS])).toBe(true);
    expect(roleHasPermissions('ADMIN', [Permission.VERIFY_PATIENT_IDENTITY])).toBe(true);
    expect(roleHasPermissions('ADMIN', [Permission.MANAGE_PLANS])).toBe(false);
    expect(roleHasPermissions('ADMIN', [Permission.MANAGE_SITE])).toBe(false);
  });

  it('SUPERADMIN tiene todos; roles de usuario ninguno', () => {
    expect(ROLE_PERMISSIONS.SUPERADMIN).toEqual(Object.values(Permission));
    for (const role of ['USER', 'PROFESSIONAL', 'ORGANIZATION'] as const) {
      expect(roleHasPermissions(role, [Permission.VIEW_ADMIN_STATS])).toBe(false);
    }
  });
});

describe('orden del directorio', () => {
  const full = {
    photoUrl: 'x',
    bio: 'b'.repeat(100),
    phone: '0414',
    whatsapp: null,
    address: 'a',
    municipality: 'Maturín',
    mppsNumber: '1',
    colmedMonagasNumber: '2',
    latitude: 1,
    seoDescription: null,
    specialtyCount: 1,
    hasSchedule: true,
  };

  it('un perfil completo suma 100', () => {
    expect(computeCompleteness(full)).toBe(100);
  });

  it('el impulso por plan es acotado: Premium incompleto no supera a Básico completo', () => {
    const premiumIncomplete = computeCompleteness({ ...full, photoUrl: null, bio: null, address: null }) + PLAN_BOOST.PREMIUM;
    const freeComplete = computeCompleteness(full) + PLAN_BOOST.FREE;
    expect(premiumIncomplete).toBeLessThan(freeComplete);
    expect(Math.max(...Object.values(PLAN_BOOST))).toBeLessThanOrEqual(15);
  });
});

describe('consentimiento: recorte por alcance', () => {
  const patient = {
    ...EMPTY_HEALTH_DATA,
    id: 'p1',
    patientCode: 'GMM-0001',
    firstName: 'Luis',
    lastName: 'Gómez',
    cedula: 'V-1',
    phone: '0414-1111111',
    bloodType: 'O+',
    emergencyMedicalPhone: '0424-2222222',
    identityStatus: 'VERIFIED',
  } as never;

  it('solo HEALTH: nada de identidad ni contacto; la cédula nunca sale', () => {
    const shaped = shapeForScopes(patient, ['HEALTH']);
    expect(shaped.identity).toBeNull();
    expect(shaped.contact).toBeNull();
    expect(shaped.health?.bloodType).toBe('O+');
    expect(JSON.stringify(shaped)).not.toContain('V-1');
  });

  it('IDENTITY + CONTACT', () => {
    const shaped = shapeForScopes(patient, ['IDENTITY', 'CONTACT']);
    expect(shaped.identity).toEqual({ firstName: 'Luis', lastName: 'Gómez', identityVerified: true });
    expect(shaped.contact?.phone).toBe('0414-1111111');
    expect(shaped.health).toBeNull();
  });
});
