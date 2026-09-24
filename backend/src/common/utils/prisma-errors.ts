import { Prisma } from '@prisma/client';

/** Violación de una restricción única (P2002), p. ej. un índice parcial perdido en una carrera. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
