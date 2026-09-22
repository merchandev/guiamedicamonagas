import { PlanTier } from '@prisma/client';

/** Orden de prioridad de los planes de médicos (mayor = más beneficios/prioridad). */
export const DOCTOR_TIER_RANK: Record<PlanTier, number> = {
  FREE: 0,
  PROFESSIONAL: 1,
  PROFESSIONAL_PLUS: 2,
  PREMIUM: 3,
  ORGANIZATION: 0,
};

export function tierAtLeast(tier: PlanTier, min: PlanTier): boolean {
  return DOCTOR_TIER_RANK[tier] >= DOCTOR_TIER_RANK[min];
}

export const SITE_SETTINGS_EXCHANGE_RATE_KEY = 'exchange_rate';

export type ExchangeRateSource = 'BCV' | 'MANUAL';

export interface ExchangeRateConfig {
  usdToBs: number;
  updatedAt: string;
  source: ExchangeRateSource;
  /** Solo presente cuando source es BCV: cuándo se sincronizó exitosamente por última vez. */
  lastBcvSyncAt?: string;
  /** Mensaje del último intento fallido de sincronización con el BCV, si aplica. */
  lastBcvSyncError?: string;
}
