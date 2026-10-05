import type { Prisma } from '@prisma/client';

/** El promedio y la distribución se muestran desde esta cantidad de valoraciones publicadas. */
export const MIN_REVIEWS_FOR_AVERAGE = 3;

/**
 * Recalcula el promedio y la cantidad de valoraciones publicadas del médico
 * dentro de la transacción del cambio. Primero bloquea la fila del médico:
 * dos publicaciones simultáneas no se pisan el resultado (la segunda espera y
 * cuenta también la primera).
 */
export async function recomputeRating(tx: Prisma.TransactionClient, professionalId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "ProfessionalProfile" WHERE "id" = ${professionalId} FOR UPDATE`;
  const result = await tx.review.aggregate({
    where: { professionalId, status: 'PUBLISHED' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const count = result._count._all;
  await tx.professionalProfile.update({
    where: { id: professionalId },
    data: { ratingCount: count, ratingAverage: count ? result._avg.rating : null },
  });
}

/** Lo que el público ve del promedio: nada hasta 3 valoraciones publicadas. */
export function publicRating(average: number | null, count: number): { average: number | null; count: number } {
  if (count < MIN_REVIEWS_FOR_AVERAGE || average === null) return { average: null, count };
  return { average: Math.round(average * 10) / 10, count };
}
