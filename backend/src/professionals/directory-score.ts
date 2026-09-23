import { PlanTier } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Impulso por plan, deliberadamente pequeño frente a la completitud (0–100):
 * el plan compra visibilidad etiquetada ("Destacado"), no el primer lugar
 * garantizado ni una recomendación clínica.
 */
export const PLAN_BOOST: Record<PlanTier, number> = {
  FREE: 0,
  PROFESSIONAL: 5,
  PROFESSIONAL_PLUS: 10,
  PREMIUM: 15,
  ORGANIZATION: 0,
};

interface CompletenessInput {
  photoUrl: string | null;
  bio: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  municipality: string | null;
  mppsNumber: string | null;
  colmedMonagasNumber: string | null;
  latitude: number | null;
  seoDescription: string | null;
  specialtyCount: number;
  hasSchedule: boolean;
}

export function computeCompleteness(p: CompletenessInput): number {
  let score = 0;
  if (p.photoUrl) score += 15;
  if (p.bio && p.bio.trim().length >= 80) score += 15;
  if (p.specialtyCount > 0) score += 10;
  if (p.phone || p.whatsapp) score += 10;
  if (p.address) score += 10;
  if (p.municipality) score += 10;
  if (p.mppsNumber) score += 10;
  if (p.colmedMonagasNumber) score += 10;
  if (p.hasSchedule) score += 5;
  if (p.latitude != null || p.seoDescription) score += 5;
  return Math.min(100, score);
}

/** Recalcula completitud y puntaje de directorio de un profesional. */
export async function recomputeDirectoryScore(prisma: Pick<PrismaService, 'professionalProfile'>, professionalId: string) {
  const profile = await prisma.professionalProfile.findUnique({
    where: { id: professionalId },
    include: {
      _count: { select: { specialties: true } },
      schedule: { select: { blocks: { select: { id: true }, take: 1 } } },
    },
  });
  if (!profile) return;
  const completeness = computeCompleteness({
    ...profile,
    specialtyCount: profile._count.specialties,
    hasSchedule: !!profile.schedule && profile.schedule.blocks.length > 0,
  });
  await prisma.professionalProfile.update({
    where: { id: professionalId },
    data: { profileCompleteness: completeness, directoryScore: completeness + PLAN_BOOST[profile.planTier] },
  });
}
