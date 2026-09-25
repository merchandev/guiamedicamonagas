import { randomBytes } from 'crypto';
import { hash as argon2Hash, verify as argon2Verify } from 'argon2';
import { describe, expect, it } from 'vitest';
import {
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  formatShareCode,
  generateShareCode,
  normalizeShareCode,
} from '../../src/patients/share-code.util';
import { FieldEncryptionService, parseKeyring } from '../../src/crypto/field-encryption.service';
import { PatientDataCodec } from '../../src/patients/patient-data.codec';
import { ENCRYPTED_FIELDS } from '../../src/crypto/key-rotation';
import { decodeVaultHash } from '../../src/patients/patient-vault.service';

const key = () => randomBytes(32).toString('base64');

describe('código de paciente para compartir', () => {
  it('tiene 12 caracteres del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShareCode();
      expect(code).toHaveLength(SHARE_CODE_LENGTH);
      for (const char of code) expect(SHARE_CODE_ALPHABET).toContain(char);
    }
    expect(SHARE_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('no se repite en miles de generaciones', () => {
    const codes = new Set(Array.from({ length: 5000 }, generateShareCode));
    expect(codes.size).toBe(5000);
  });

  it('se muestra en grupos de 4 y se acepta con guiones, espacios o minúsculas', () => {
    const code = generateShareCode();
    const shown = formatShareCode(code);
    expect(shown).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeShareCode(shown)).toBe(code);
    expect(normalizeShareCode(` ${shown.toLowerCase().replace(/-/g, ' ')} `)).toBe(code);
  });

  it('rechaza longitudes o caracteres fuera del alfabeto', () => {
    expect(normalizeShareCode('ABCD-EFGH-JKM')).toBeNull();
    expect(normalizeShareCode('ABCD-EFGH-JKMO')).toBeNull(); // la O no existe en el alfabeto
    expect(normalizeShareCode('GMM-A4F2')).toBeNull(); // el seudónimo de agenda no es un código para compartir
  });

  it('se guarda cifrado y se busca por HMAC, sin salir por decode()', () => {
    const crypto = FieldEncryptionService.fromKeyring(parseKeyring(`v1:${key()}`, 'v1', key()));
    const codec = new PatientDataCodec(crypto);
    const code = generateShareCode();
    const stored = codec.encodeShareCode(code);
    expect(stored.shareCodeEnc).not.toContain(code);
    expect(stored.shareCodeLookup).toBe(codec.shareCodeLookup(code));
    expect(codec.decodeShareCode({ shareCodeEnc: stored.shareCodeEnc })).toBe(code);
    expect(ENCRYPTED_FIELDS.some((f) => f.field === 'shareCodeEnc')).toBe(true);
  });
});

describe('bóveda de pacientes', () => {
  it('acepta el hash Argon2id en base64 o tal cual, y nada más', async () => {
    const hash = await argon2Hash('codigo-de-prueba');
    expect(decodeVaultHash(Buffer.from(hash).toString('base64'))).toBe(hash);
    expect(decodeVaultHash(hash)).toBe(hash);
    expect(decodeVaultHash('')).toBeNull();
    expect(decodeVaultHash(undefined)).toBeNull();
    expect(decodeVaultHash(Buffer.from('texto plano').toString('base64'))).toBeNull();
    expect(await argon2Verify(decodeVaultHash(Buffer.from(hash).toString('base64'))!, 'codigo-de-prueba')).toBe(true);
    expect(await argon2Verify(hash, 'otro-codigo')).toBe(false);
  });
});
