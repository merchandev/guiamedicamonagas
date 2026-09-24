import { randomBytes } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { productionWarnings, validateEnv } from '../../src/config/env.validation';
import { FieldEncryptionService, parseKeyring } from '../../src/crypto/field-encryption.service';
import { ENCRYPTED_FIELDS, reencryptIfStale } from '../../src/crypto/key-rotation';
import { ClinicalNoteCodec, CLINICAL_NOTE_CONTEXT } from '../../src/clinical/clinical-note.codec';
import {
  canOrg,
  canRemoveMember,
  invitableRoles,
  ORGANIZATION_ROLE_ACTIONS,
} from '../../src/organizations/organization-roles';
import { hashInvitationToken, maskEmail, newInvitationToken } from '../../src/organizations/organization-invitations';
import { isUniqueViolation } from '../../src/common/utils/prisma-errors';

const key = () => randomBytes(32).toString('base64');

const BASE_ENV = {
  FRONTEND_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(40),
  JWT_REFRESH_SECRET: 'y'.repeat(40),
  COOKIE_SECRET: 'z'.repeat(40),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'gmm',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret-key-value',
  SMTP_HOST: 'localhost',
  MAIL_FROM: 'GMM <no-reply@example.com>',
  DATA_ENCRYPTION_KEYS: `v1:${key()}`,
  DATA_LOOKUP_KEY: key(),
};

describe('producción: MFA y antivirus obligatorios', () => {
  const production = { ...BASE_ENV, NODE_ENV: 'production', CLAMAV_HOST: 'clamav', ADMIN_MFA_ENABLED: 'true' };

  it('arranca con MFA y ClamAV', () => {
    expect(validateEnv(production).NODE_ENV).toBe('production');
  });

  it('sin ClamAV no arranca', () => {
    expect(() => validateEnv({ ...production, CLAMAV_HOST: '' })).toThrow(/CLAMAV_HOST/);
  });

  it('sin MFA ni excepción fechada no arranca', () => {
    expect(() => validateEnv({ ...production, ADMIN_MFA_ENABLED: 'false' })).toThrow(/ADMIN_MFA_ENABLED/);
  });

  it('la excepción de MFA exige fecha AAAA-MM-DD y se avisa, vigente o vencida', () => {
    expect(() => validateEnv({ ...production, ADMIN_MFA_ENABLED: 'false', ADMIN_MFA_WAIVER_UNTIL: 'pronto' })).toThrow();
    const env = validateEnv({ ...production, ADMIN_MFA_ENABLED: 'false', ADMIN_MFA_WAIVER_UNTIL: '2026-10-24' });
    expect(productionWarnings(env, new Date('2026-09-24'))[0]).toMatch(/hasta el 2026-10-24/);
    expect(productionWarnings(env, new Date('2026-11-01'))[0]).toMatch(/venció/);
  });

  it('una excepción vacía (compose sin la variable) cuenta como inexistente', () => {
    expect(() => validateEnv({ ...production, ADMIN_MFA_WAIVER_UNTIL: '' })).not.toThrow();
    expect(() => validateEnv({ ...production, ADMIN_MFA_ENABLED: 'false', ADMIN_MFA_WAIVER_UNTIL: '' })).toThrow(
      /ADMIN_MFA_ENABLED/,
    );
  });

  it('sin HTTPS se avisa como NO-GO', () => {
    const env = validateEnv({ ...production, COOKIE_SECURE: 'false' });
    expect(productionWarnings(env).join(' ')).toMatch(/COOKIE_SECURE=false.*FRONTEND_URL no usa HTTPS/);
  });

  it('en desarrollo no exige nada de eso', () => {
    expect(() => validateEnv({ ...BASE_ENV, NODE_ENV: 'development' })).not.toThrow();
    expect(productionWarnings(validateEnv({ ...BASE_ENV, NODE_ENV: 'development' }))).toEqual([]);
  });
});

describe('roles dentro de una organización', () => {
  it('EDITOR edita contenido, pero no identidad, equipo, médicos ni plan', () => {
    expect(canOrg('EDITOR', 'EDIT_CONTENT')).toBe(true);
    for (const action of ['EDIT_IDENTITY', 'INVITE_MEMBERS', 'MANAGE_PROFESSIONALS', 'MANAGE_BILLING', 'MANAGE_ROLES'] as const) {
      expect(canOrg('EDITOR', action)).toBe(false);
    }
  });

  it('ADMIN gestiona equipo, médicos y plan, pero no la identidad ni los roles', () => {
    expect(canOrg('ADMIN', 'INVITE_MEMBERS')).toBe(true);
    expect(canOrg('ADMIN', 'MANAGE_BILLING')).toBe(true);
    expect(canOrg('ADMIN', 'EDIT_IDENTITY')).toBe(false);
    expect(canOrg('ADMIN', 'MANAGE_ROLES')).toBe(false);
  });

  it('el dueño puede todo', () => {
    expect(ORGANIZATION_ROLE_ACTIONS.OWNER).toHaveLength(7);
  });

  it('nadie invita por encima de su rol ni retira a quien no debe', () => {
    expect(invitableRoles('OWNER')).toEqual(['ADMIN', 'EDITOR']);
    expect(invitableRoles('ADMIN')).toEqual(['EDITOR']);
    expect(invitableRoles('EDITOR')).toEqual([]);
    expect(canRemoveMember('ADMIN', 'EDITOR')).toBe(true);
    expect(canRemoveMember('ADMIN', 'ADMIN')).toBe(false);
    expect(canRemoveMember('ADMIN', 'OWNER')).toBe(false);
    expect(canRemoveMember('EDITOR', 'EDITOR')).toBe(false);
  });
});

describe('invitaciones', () => {
  it('token de 32 bytes; en la base solo su hash', () => {
    const { token, tokenHash } = newInvitationToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(tokenHash).toBe(hashInvitationToken(token));
    expect(tokenHash).not.toContain(token);
    expect(newInvitationToken().token).not.toBe(token);
  });

  it('la vista previa enmascara el correo', () => {
    expect(maskEmail('maria.perez@correo.com')).toBe('m***@correo.com');
  });
});

describe('notas clínicas cifradas', () => {
  const crypto = FieldEncryptionService.fromKeyring(parseKeyring(`v1:${key()}`, 'v1', key()));
  const codec = new ClinicalNoteCodec(crypto);
  const note = {
    chiefComplaint: 'Dolor torácico',
    diagnosis: 'Angina estable',
    treatment: 'Reposo',
    medications: [{ name: 'Aspirina', dose: '100 mg' }],
    privateNotes: 'Antecedente familiar',
  };

  it('ida y vuelta sin texto en claro', () => {
    const encrypted = codec.encode(note);
    expect(encrypted).toMatch(/^gmm1\.v1\./);
    expect(encrypted).not.toMatch(/Angina|Aspirina|torácico/);
    expect(codec.decode(encrypted)).toEqual(note);
  });

  it('el valor queda atado a su columna (AAD)', () => {
    expect(() => crypto.decrypt(codec.encode(note), 'PatientProfile.healthData')).toThrow();
    expect(ENCRYPTED_FIELDS.some((f) => f.context === CLINICAL_NOTE_CONTEXT)).toBe(true);
  });

  it('ningún controlador expone notas clínicas (sin endpoints hasta que se diseñen con consentimiento)', () => {
    const controllers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry.endsWith('.controller.ts')) controllers.push(path);
      }
    };
    walk(join(__dirname, '../../src'));
    expect(controllers.length).toBeGreaterThan(10);
    for (const file of controllers) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/clinical/i);
    }
  });
});

describe('rotación de claves', () => {
  const k1 = key();
  const k2 = key();
  const lookup = key();
  const oldCrypto = FieldEncryptionService.fromKeyring(parseKeyring(`v1:${k1}`, 'v1', lookup));
  const rotating = FieldEncryptionService.fromKeyring(parseKeyring(`v1:${k1},v2:${k2}`, 'v2', lookup));

  it('re-cifra con la clave activa lo cifrado con una anterior', () => {
    const old = oldCrypto.encrypt('V-12345678', 'PatientProfile.cedula');
    const rotated = reencryptIfStale(rotating, old, 'PatientProfile.cedula')!;
    expect(rotated).toMatch(/^gmm1\.v2\./);
    expect(rotating.decrypt(rotated, 'PatientProfile.cedula')).toBe('V-12345678');
    expect(reencryptIfStale(rotating, rotated, 'PatientProfile.cedula')).toBeNull();
  });

  it('ignora nulos y valores sin cifrar (motivos de consulta anteriores)', () => {
    expect(reencryptIfStale(rotating, null, 'Appointment.reason')).toBeNull();
    expect(reencryptIfStale(rotating, 'Control anual', 'Appointment.reason')).toBeNull();
  });
});

describe('Pago Móvil: carrera por la misma referencia', () => {
  it('P2002 del índice único parcial se reconoce como duplicado', () => {
    const error = new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: 'test' });
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(new Error('otro'))).toBe(false);
  });
});
