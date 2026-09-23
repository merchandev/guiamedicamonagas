import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import type { EnvConfig } from '../config/env.validation';

const FORMAT_PREFIX = 'gmm1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export interface Keyring {
  activeKeyId: string;
  keys: Map<string, Buffer>;
  lookupKey: Buffer;
}

/**
 * "v1:<base64>,v2:<base64>" → Map. Cada clave debe medir exactamente 32
 * bytes (AES-256). El id no puede contener ":" ni "." porque forman parte
 * del formato del texto cifrado.
 */
export function parseKeyring(encryptionKeys: string, activeKeyId: string, lookupKey: string): Keyring {
  const keys = new Map<string, Buffer>();
  for (const entry of encryptionKeys.split(',').map((e) => e.trim()).filter(Boolean)) {
    const separator = entry.indexOf(':');
    if (separator <= 0) throw new Error('DATA_ENCRYPTION_KEYS: formato esperado "id:base64[,id:base64]"');
    const id = entry.slice(0, separator);
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) throw new Error(`DATA_ENCRYPTION_KEYS: id de clave inválido "${id}"`);
    const key = Buffer.from(entry.slice(separator + 1), 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(`DATA_ENCRYPTION_KEYS: la clave "${id}" debe medir ${KEY_BYTES} bytes (openssl rand -base64 32)`);
    }
    keys.set(id, key);
  }
  if (!keys.has(activeKeyId)) {
    throw new Error(`DATA_ENCRYPTION_ACTIVE_KEY "${activeKeyId}" no existe en DATA_ENCRYPTION_KEYS`);
  }
  const lookup = Buffer.from(lookupKey, 'base64');
  if (lookup.length < KEY_BYTES) {
    throw new Error('DATA_LOOKUP_KEY debe medir al menos 32 bytes (openssl rand -base64 32)');
  }
  if ([...keys.values()].some((k) => k.equals(lookup))) {
    throw new Error('DATA_LOOKUP_KEY debe ser distinta de las claves de cifrado');
  }
  return { activeKeyId, keys, lookupKey: lookup };
}

/**
 * SEC-05 — cifrado de campos en capa de aplicación.
 *
 * - AES-256-GCM (cifrado autenticado): un texto manipulado en la base de
 *   datos no se descifra, falla.
 * - IV aleatorio de 96 bits por valor.
 * - AAD = contexto del campo ("PatientProfile.cedula"): un valor cifrado no
 *   se puede copiar a otra columna y descifrarse ahí.
 * - Llavero versionado (DATA_ENCRYPTION_KEYS): cada texto cifrado lleva el id
 *   de su clave, así que rotar es agregar una clave nueva, marcarla activa y
 *   re-cifrar en segundo plano; las viejas siguen descifrando mientras tanto.
 * - Las claves viven en el entorno del contenedor (fuera de PostgreSQL): un
 *   respaldo o volcado de la base de datos no basta para leer los datos.
 *
 * Formato: gmm1.<keyId>.<iv>.<tag>.<ciphertext>  (base64url)
 */
@Injectable()
export class FieldEncryptionService {
  private readonly keyring: Keyring;

  constructor(config: ConfigService<EnvConfig, true>) {
    this.keyring = parseKeyring(
      config.get('DATA_ENCRYPTION_KEYS', { infer: true }),
      config.get('DATA_ENCRYPTION_ACTIVE_KEY', { infer: true }),
      config.get('DATA_LOOKUP_KEY', { infer: true }),
    );
  }

  static fromKeyring(keyring: Keyring): FieldEncryptionService {
    const instance = Object.create(FieldEncryptionService.prototype) as FieldEncryptionService;
    (instance as unknown as { keyring: Keyring }).keyring = keyring;
    return instance;
  }

  encrypt(plaintext: string, context: string): string {
    const keyId = this.keyring.activeKeyId;
    const key = this.keyring.keys.get(keyId)!;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [FORMAT_PREFIX, keyId, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt(payload: string, context: string): string {
    const parts = payload.split('.');
    if (parts.length !== 5 || parts[0] !== FORMAT_PREFIX) {
      throw new Error('Formato de dato cifrado desconocido');
    }
    const [, keyId, ivB64, tagB64, ctB64] = parts;
    const key = this.keyring.keys.get(keyId);
    if (!key) throw new Error(`Clave de cifrado "${keyId}" no disponible`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
  }

  encryptNullable(value: string | null | undefined, context: string): string | null {
    return value === null || value === undefined || value === '' ? null : this.encrypt(value, context);
  }

  decryptNullable(payload: string | null | undefined, context: string): string | null {
    return payload ? this.decrypt(payload, context) : null;
  }

  encryptJson(value: unknown, context: string): string {
    return this.encrypt(JSON.stringify(value), context);
  }

  decryptJson<T>(payload: string | null | undefined, context: string): T | null {
    return payload ? (JSON.parse(this.decrypt(payload, context)) as T) : null;
  }

  /** true si el valor fue cifrado con una clave que ya no es la activa (candidato a re-cifrar). */
  needsRotation(payload: string): boolean {
    return payload.split('.')[1] !== this.keyring.activeKeyId;
  }

  /**
   * HMAC-SHA256 del valor ya normalizado, con una clave propia y separada
   * por contexto. Determinista: sirve para unicidad y búsqueda exacta, pero
   * sin la clave no se puede enumerar (a diferencia de un SHA-256 simple de
   * una cédula, que se revierte probando todas las cédulas posibles).
   */
  lookupHash(normalizedValue: string, context: string): string {
    return createHmac('sha256', this.keyring.lookupKey).update(`${context}\u0000${normalizedValue}`).digest('hex');
  }
}

/** "v-12.345.678" → "V12345678" */
export function normalizeCedula(value: string): string {
  return value.toUpperCase().replace(/[^VEJPG0-9]/g, '');
}

/** "0414-123.45.67" → "04141234567" */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

/** "v12345678" → "V-12345678" (forma de presentación) */
export function formatCedula(value: string): string {
  const normalized = normalizeCedula(value);
  return `${normalized.charAt(0)}-${normalized.slice(1)}`;
}

/** "04141234567" → "0414-1234567" (forma de presentación) */
export function formatPhone(value: string): string {
  const digits = normalizePhone(value);
  return digits.length === 11 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
}
