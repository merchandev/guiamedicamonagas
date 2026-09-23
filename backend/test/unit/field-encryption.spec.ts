import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  FieldEncryptionService,
  formatCedula,
  normalizeCedula,
  normalizePhone,
  parseKeyring,
} from '../../src/crypto/field-encryption.service';

const key = () => randomBytes(32).toString('base64');
const makeService = (keys: string, active: string, lookup = key()) =>
  FieldEncryptionService.fromKeyring(parseKeyring(keys, active, lookup));

describe('FieldEncryptionService', () => {
  const k1 = key();
  const service = makeService(`v1:${k1}`, 'v1');

  it('cifra y descifra (ida y vuelta)', () => {
    const payload = service.encrypt('Hipertensión arterial', 'Test.field');
    expect(payload).toMatch(/^gmm1\.v1\./);
    expect(payload).not.toContain('Hipertens');
    expect(service.decrypt(payload, 'Test.field')).toBe('Hipertensión arterial');
  });

  it('usa un IV distinto en cada cifrado', () => {
    expect(service.encrypt('V-12345678', 'x')).not.toBe(service.encrypt('V-12345678', 'x'));
  });

  it('rechaza un texto cifrado manipulado (GCM autenticado)', () => {
    const payload = service.encrypt('dato', 'ctx');
    const parts = payload.split('.');
    const ct = Buffer.from(parts[4], 'base64url');
    ct[0] ^= 0xff;
    parts[4] = ct.toString('base64url');
    expect(() => service.decrypt(parts.join('.'), 'ctx')).toThrow();
  });

  it('no descifra si se copia el valor a otro campo (AAD por contexto)', () => {
    const payload = service.encrypt('V-12345678', 'PatientProfile.cedula');
    expect(() => service.decrypt(payload, 'PatientProfile.phone')).toThrow();
  });

  it('rota claves: la nueva cifra, la vieja sigue descifrando', () => {
    const k2 = key();
    const lookup = key();
    const oldService = makeService(`v1:${k1}`, 'v1', lookup);
    const legacy = oldService.encrypt('dato antiguo', 'ctx');
    const rotated = makeService(`v1:${k1},v2:${k2}`, 'v2', lookup);
    expect(rotated.decrypt(legacy, 'ctx')).toBe('dato antiguo');
    expect(rotated.needsRotation(legacy)).toBe(true);
    const fresh = rotated.encrypt('dato nuevo', 'ctx');
    expect(fresh.split('.')[1]).toBe('v2');
    expect(rotated.needsRotation(fresh)).toBe(false);
  });

  it('JSON cifrado conserva la estructura', () => {
    const data = { medications: [{ name: 'Losartán', schedule: '8am' }], isHealthy: false };
    expect(service.decryptJson(service.encryptJson(data, 'h'), 'h')).toEqual(data);
  });

  it('el hash de búsqueda es determinista, depende de la clave y del contexto', () => {
    const lookup = key();
    const a = makeService(`v1:${k1}`, 'v1', lookup);
    const b = makeService(`v1:${k1}`, 'v1', lookup);
    const other = makeService(`v1:${k1}`, 'v1');
    expect(a.lookupHash('V12345678', 'c')).toBe(b.lookupHash('V12345678', 'c'));
    expect(a.lookupHash('V12345678', 'c')).not.toBe(other.lookupHash('V12345678', 'c'));
    expect(a.lookupHash('V12345678', 'c')).not.toBe(a.lookupHash('V12345678', 'd'));
  });

  it('valida el llavero', () => {
    expect(() => parseKeyring('v1:corta', 'v1', key())).toThrow(/32 bytes/);
    expect(() => parseKeyring(`v1:${key()}`, 'v2', key())).toThrow(/no existe/);
    const same = key();
    expect(() => parseKeyring(`v1:${same}`, 'v1', same)).toThrow(/distinta/);
    expect(() => parseKeyring(`v1:${key()}`, 'v1', 'corta')).toThrow(/32 bytes/);
  });
});

describe('normalización', () => {
  it('cédula: mismas cédulas escritas distinto normalizan igual', () => {
    expect(normalizeCedula('v-12.345.678')).toBe('V12345678');
    expect(normalizeCedula('V12345678')).toBe('V12345678');
    expect(formatCedula('v12345678')).toBe('V-12345678');
  });

  it('teléfono: solo dígitos', () => {
    expect(normalizePhone('0414-123.45.67')).toBe('04141234567');
  });
});
