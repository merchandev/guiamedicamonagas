import { randomInt } from 'crypto';

/**
 * Código que el paciente comparte con su médico (texto o QR).
 *
 * 12 caracteres de un alfabeto de 31 sin símbolos ambiguos (sin 0/O, 1/I/L):
 * 31^12 ≈ 7,9·10^17 combinaciones, así que adivinar uno no es viable aun sin el
 * límite de intentos. Se muestra en grupos de 4 («K7Q4-M9TX-P3WD») y se acepta
 * con o sin guiones, espacios o minúsculas.
 */
export const SHARE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const SHARE_CODE_LENGTH = 12;

export function generateShareCode(): string {
  let code = '';
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) code += SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)];
  return code;
}

/** Forma canónica (la que se cifra y se busca): 12 caracteres en mayúsculas. */
export function normalizeShareCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== SHARE_CODE_LENGTH) return null;
  for (const char of code) if (!SHARE_CODE_ALPHABET.includes(char)) return null;
  return code;
}

export function formatShareCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}
