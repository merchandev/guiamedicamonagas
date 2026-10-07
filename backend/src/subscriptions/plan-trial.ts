import type { PlanTier, TrialNotice } from '@prisma/client';
import { caracasLongDate, caracasTimeLabel } from '../common/caracas-time';
import { trialAvailable } from '../professionals/publication-rules';
import { TRIAL_TIER } from './plan-tiers';

const DAY = 86_400_000;

/** Avisos antes de que venza la prueba gratuita, en días. */
export const TRIAL_REMINDER_DAYS = 3;
export const TRIAL_LAST_REMINDER_DAYS = 1;

export type TrialStep = 'NONE' | 'CLOSE' | 'ENDS_IN_3_DAYS' | 'ENDS_IN_1_DAY' | 'EXPIRE';

/**
 * Qué toca hacer ahora con la prueba gratuita de un médico:
 * - Si pagó un plan (o ya no tiene el plan de la prueba), se cierra sin aviso.
 * - Al vencer, se cierra y el perfil deja de mostrarse (aviso «terminó»).
 * - Antes: un aviso al entrar en los últimos 3 días y otro en el último día.
 *   Si el primero no salió a tiempo (servidor caído), sale solo el segundo.
 */
export function trialStep(p: {
  now: Date;
  trialEndsAt: Date | null;
  notice: TrialNotice;
  onTrialTier: boolean;
  hasPaidPlan: boolean;
}): TrialStep {
  if (!p.trialEndsAt || p.notice === 'CLOSED') return 'NONE';
  if (p.hasPaidPlan || !p.onTrialTier) return 'CLOSE';
  const left = p.trialEndsAt.getTime() - p.now.getTime();
  if (left <= 0) return 'EXPIRE';
  if (left <= TRIAL_LAST_REMINDER_DAYS * DAY) return p.notice === 'ENDS_IN_1_DAY' ? 'NONE' : 'ENDS_IN_1_DAY';
  if (left <= TRIAL_REMINDER_DAYS * DAY) return p.notice === 'NONE' ? 'ENDS_IN_3_DAYS' : 'NONE';
  return 'NONE';
}

/**
 * Desde dónde se calcula el vencimiento de un pago: si el médico paga durante
 * su prueba, desde el fin de la prueba (los días que le quedaban se suman a su
 * plan); si no, desde el pago. El plan pagado rige desde que se valida.
 */
export function paidPeriodAnchor(
  from: Date,
  profile: { planTier: string; trialEndsAt: Date | null; trialNotice: TrialNotice },
  trialTier: string,
): Date {
  const onTrial =
    profile.planTier === trialTier && profile.trialNotice !== 'CLOSED' && !!profile.trialEndsAt && profile.trialEndsAt > from;
  return onTrial ? profile.trialEndsAt! : from;
}

/** «20 de octubre de 2026 a las 9:15 p. m.» (hora de Caracas). */
export function trialEndLabel(date: Date): string {
  return `${caracasLongDate(date)} a las ${caracasTimeLabel(date)}`;
}

export interface PlanStatus {
  /** TRIAL: prueba gratuita en curso · PAID: plan pagado · NONE: sin plan (el perfil no se muestra). */
  kind: 'TRIAL' | 'PAID' | 'NONE';
  tier: PlanTier;
  /** Fin de la prueba o del periodo pagado. */
  endsAt: Date | null;
  /** La prueba todavía no se usó: empieza sola al cumplir los requisitos. */
  trialAvailable: boolean;
  /** Cuándo terminó la prueba, si ya terminó. */
  trialEndedAt: Date | null;
}

/** Estado del plan para el panel del médico. */
export function planStatus(
  p: { planTier: PlanTier; trialStartedAt: Date | null; trialEndsAt: Date | null; trialNotice: TrialNotice },
  activePaid: { currentPeriodEnd: Date | null } | null,
  now = new Date(),
): PlanStatus {
  const trialEndedAt = p.trialStartedAt && p.trialEndsAt && p.trialEndsAt <= now ? p.trialEndsAt : null;
  if (p.planTier === 'FREE' || p.planTier === 'ORGANIZATION') {
    return { kind: 'NONE', tier: p.planTier, endsAt: null, trialAvailable: trialAvailable(p), trialEndedAt };
  }
  // En la prueba aunque su fin acabe de pasar: la tarea horaria todavía no la cerró.
  if (!activePaid && p.planTier === TRIAL_TIER && !!p.trialStartedAt && p.trialNotice !== 'CLOSED') {
    return { kind: 'TRIAL', tier: p.planTier, endsAt: p.trialEndsAt, trialAvailable: false, trialEndedAt: null };
  }
  return { kind: 'PAID', tier: p.planTier, endsAt: activePaid?.currentPeriodEnd ?? null, trialAvailable: false, trialEndedAt };
}
