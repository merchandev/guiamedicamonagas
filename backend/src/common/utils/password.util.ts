/**
 * password.util.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Abstracción de hashing de contraseñas con migración progresiva
 * bcrypt → Argon2id (sin impacto para el usuario).
 *
 * Estrategia:
 *  - Los hashes NUEVOS siempre se crean con Argon2id.
 *  - Los hashes VIEJOS (bcrypt, identificados por el prefijo "$2") siguen
 *    verificándose con bcrypt.
 *  - En el login, si el hash es bcrypt y la contraseña es correcta, se
 *    re-hashea automáticamente con Argon2id y se guarda el hash nuevo.
 *    El usuario no nota nada.
 *
 * Normas: OWASP ASVS 5.0 §2.4 · OWASP Password Storage Cheat Sheet
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { hash as argon2Hash, verify as argon2Verify, argon2id } from 'argon2';
import * as bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Parámetros Argon2id (OWASP ASVS 5.0 §2.4.4 mínimo: m=19456, t=2, p=1)
// ---------------------------------------------------------------------------
const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 65536,  // 64 MB en KiB
  timeCost: 3,         // 3 iteraciones
  parallelism: 1,      // 1 hilo (recomendado para servidores compartidos)
} as const;

// Prefijo que identifica hashes bcrypt para la detección automática
const BCRYPT_PREFIX = '$2';

/**
 * Genera un hash Argon2id para una contraseña nueva o cambiada.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

/**
 * Resultado de la verificación de contraseña.
 *  - `valid`       — la contraseña es correcta
 *  - `needsRehash` — el hash era bcrypt; el llamador debe actualizar el hash en BD
 *  - `newHash`     — nuevo hash Argon2id (solo presente si `needsRehash = true`)
 */
export interface VerifyResult {
  valid: boolean;
  needsRehash: boolean;
  newHash?: string;
}

/**
 * Verifica una contraseña contra un hash almacenado.
 * Detecta automáticamente si el hash es bcrypt o Argon2id.
 * Si es bcrypt y la contraseña es correcta, devuelve el nuevo hash Argon2id.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<VerifyResult> {
  // ─── Caso 1: hash legacy bcrypt ───────────────────────────────────────────
  if (storedHash.startsWith(BCRYPT_PREFIX)) {
    const valid = await bcrypt.compare(password, storedHash);
    if (!valid) return { valid: false, needsRehash: false };

    // Contraseña correcta → re-hashear en Argon2id silenciosamente
    const newHash = await hashPassword(password);
    return { valid: true, needsRehash: true, newHash };
  }

  // ─── Caso 2: hash moderno Argon2id ────────────────────────────────────────
  const valid = await argon2Verify(storedHash, password);
  return { valid, needsRehash: false };
}
