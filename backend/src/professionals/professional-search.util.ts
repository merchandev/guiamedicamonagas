import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import { SHARE_CODE_ALPHABET } from '../patients/share-code.util';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Código público del médico: «GM-» + 6 caracteres del mismo alfabeto sin
 * ambiguos que el código de paciente (31^6 ≈ 887 millones de combinaciones).
 * Es para compartir (tarjeta, QR, WhatsApp): no es un secreto.
 */
export const PUBLIC_CODE_PREFIX = 'GM';
export const PUBLIC_CODE_LENGTH = 6;

export function generatePublicCode(): string {
  let code = '';
  for (let i = 0; i < PUBLIC_CODE_LENGTH; i++) code += SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)];
  return `${PUBLIC_CODE_PREFIX}-${code}`;
}

/** Acepta «GM-7KQ4M9», «gm7kq4m9» o solo «7KQ4M9»; devuelve la forma canónica o null. */
export function normalizePublicCode(input: string): string | null {
  let code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.startsWith(PUBLIC_CODE_PREFIX) && code.length === PUBLIC_CODE_PREFIX.length + PUBLIC_CODE_LENGTH) {
    code = code.slice(PUBLIC_CODE_PREFIX.length);
  }
  if (code.length !== PUBLIC_CODE_LENGTH) return null;
  for (const char of code) if (!SHARE_CODE_ALPHABET.includes(char)) return null;
  return `${PUBLIC_CODE_PREFIX}-${code}`;
}

/** Minúsculas, sin tildes ni diéresis, espacios simples: «Pérez  Núñez» → «perez nunez». */
export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchNameFor(firstName: string, lastName: string): string {
  return normalizeSearchText(`${firstName} ${lastName}`);
}

/** Términos de búsqueda: normalizados, sin repetir, de 2+ caracteres, máximo 5. */
export function searchTerms(query: string): string[] {
  const terms = normalizeSearchText(query.slice(0, 80))
    .split(' ')
    .map((t) => t.replace(/[^a-z0-9ñ-]/g, ''))
    .filter((t) => t.length >= 2);
  return [...new Set(terms)].slice(0, 5);
}

/**
 * Filtro del buscador del directorio: SOLO nombre (normalizado), especialidad
 * o código público. Nunca cédula, RIF, correo, teléfono ni dirección, y nunca
 * datos de pacientes (la consulta es solo sobre ProfessionalProfile).
 * Cada término debe aparecer en el nombre o en una especialidad.
 */
export function directorySearchWhere(query: string | undefined): Prisma.ProfessionalProfileWhereInput | undefined {
  if (!query?.trim()) return undefined;
  const code = normalizePublicCode(query);
  const terms = searchTerms(query);
  const byTerms: Prisma.ProfessionalProfileWhereInput | undefined = terms.length
    ? {
        AND: terms.map((term) => ({
          OR: [
            { searchName: { contains: term } },
            { specialties: { some: { specialty: { slug: { contains: term } } } } },
          ],
        })),
      }
    : undefined;
  const options = [code ? { publicCode: code } : undefined, byTerms].filter(
    (w): w is Prisma.ProfessionalProfileWhereInput => !!w,
  );
  // Una búsqueda sin términos útiles (p. ej. «a») no devuelve todo el directorio.
  return options.length ? { OR: options } : { id: '__sin-resultados__' };
}

/** Asigna un código público único (reintenta ante la improbable colisión). */
export async function assignPublicCode(prisma: Pick<PrismaService, 'professionalProfile'>, professionalId: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const updated = await prisma.professionalProfile.update({
        where: { id: professionalId },
        data: { publicCode: generatePublicCode() },
        select: { publicCode: true },
      });
      return updated.publicCode;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }
  }
  throw new Error('No se pudo asignar un código público único');
}
