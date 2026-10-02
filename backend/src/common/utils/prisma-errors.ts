import { Prisma } from '@prisma/client';

/** Violación de una restricción única (P2002), p. ej. un índice parcial perdido en una carrera. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Dos citas activas del mismo médico que se solapan: el índice único del
 * mismo inicio (P2002) o la restricción de exclusión «Appointment_no_overlap»
 * (PostgreSQL 23P01, que Prisma no traduce a un código propio).
 */
export function isSlotConflict(error: unknown): boolean {
  if (isUniqueViolation(error)) return true;
  const text = [
    error instanceof Error ? error.message : String(error),
    JSON.stringify((error as { meta?: unknown })?.meta ?? {}),
  ].join(' ');
  return text.includes('Appointment_no_overlap') || text.includes('23P01');
}
