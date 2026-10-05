import type { Prisma, SanctionType } from '@prisma/client';
import { caracasLongDate } from '../common/caracas-time';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_SANCTION_DAYS = 365;
/** Atajos de la pantalla de moderación (también se puede escribir otra cantidad de 1 a 365). */
export const SANCTION_PRESET_DAYS = [1, 3, 7, 15, 30, 90] as const;

/** Sanción vigente: no levantada, ya empezada y sin fin o con el fin por delante. */
export function activeSanctionWhere(userId: string, type: SanctionType, now = new Date()): Prisma.UserSanctionWhereInput {
  return { userId, type, liftedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}

/** Fin de una sanción de `days` días contados desde `from`; null = indefinida. */
export function sanctionEndsAt(days: number | null, from = new Date()): Date | null {
  if (days === null) return null;
  if (!Number.isInteger(days) || days < 1 || days > MAX_SANCTION_DAYS) {
    throw new RangeError(`La sanción debe durar de 1 a ${MAX_SANCTION_DAYS} días`);
  }
  return new Date(from.getTime() + days * DAY_MS);
}

/** «15 de octubre de 2026» en hora de Caracas, o null si es indefinida. */
export function sanctionEndLabel(endsAt: Date | null): string | null {
  return endsAt ? caracasLongDate(endsAt) : null;
}

/** Frase para avisos y bloqueos: «hasta el 15 de octubre de 2026» o «por tiempo indefinido». */
export function sanctionUntilText(endsAt: Date | null): string {
  const label = sanctionEndLabel(endsAt);
  return label ? `hasta el ${label}` : 'por tiempo indefinido';
}

/**
 * Hasta cuándo no puede iniciar sesión: el fin más lejano de sus suspensiones
 * de cuenta vigentes, o null si no le queda ninguna.
 */
export async function recomputeSuspendedUntil(tx: Prisma.TransactionClient, userId: string, now = new Date()): Promise<Date | null> {
  const latest = await tx.userSanction.findFirst({
    where: activeSanctionWhere(userId, 'ACCOUNT', now),
    orderBy: { endsAt: 'desc' },
    select: { endsAt: true },
  });
  const suspendedUntil = latest?.endsAt ?? null;
  await tx.user.update({ where: { id: userId }, data: { suspendedUntil } });
  return suspendedUntil;
}
