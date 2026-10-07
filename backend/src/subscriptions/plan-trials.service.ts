import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { PlanTier, TrialNotice } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { recomputeProfessionalStatus } from '../professionals/publication-rules';
import { recomputeDirectoryScore } from '../professionals/directory-score';
import { TRIAL_TIER } from './plan-tiers';
import { TRIAL_REMINDER_DAYS, trialStep, type TrialStep } from './plan-trial';
import { notifyTrialEnding, notifyTrialExpired } from './plan-trial-notices';

const NEXT_NOTICE: Record<Exclude<TrialStep, 'NONE'>, TrialNotice> = {
  CLOSE: 'CLOSED',
  EXPIRE: 'CLOSED',
  ENDS_IN_3_DAYS: 'ENDS_IN_3_DAYS',
  ENDS_IN_1_DAY: 'ENDS_IN_1_DAY',
};

/**
 * Prueba gratuita de Plus: avisos 3 días y 1 día antes de que venza y, al
 * vencer sin un plan pagado, el perfil vuelve a «sin plan» y deja de
 * mostrarse en el directorio (ver publication-rules.ts).
 */
@Injectable()
export class PlanTrialsService {
  private readonly logger = new Logger(PlanTrialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processTrials(now = new Date()) {
    const due = await this.prisma.professionalProfile.findMany({
      where: {
        trialNotice: { not: 'CLOSED' },
        trialEndsAt: { not: null, lte: new Date(now.getTime() + TRIAL_REMINDER_DAYS * 86_400_000) },
      },
      select: {
        id: true,
        userId: true,
        firstName: true,
        planTier: true,
        trialEndsAt: true,
        trialNotice: true,
        user: { select: { email: true } },
        subscriptions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
      },
    });
    for (const profile of due) {
      const step = trialStep({
        now,
        trialEndsAt: profile.trialEndsAt,
        notice: profile.trialNotice,
        onTrialTier: profile.planTier === TRIAL_TIER,
        hasPaidPlan: profile.subscriptions.length > 0,
      });
      if (step === 'NONE') continue;
      try {
        await this.apply(profile, step, now);
      } catch (error) {
        this.logger.warn(`Prueba de ${profile.id}: ${(error as Error).message}`);
      }
    }
  }

  private async apply(
    profile: { id: string; userId: string; firstName: string; planTier: PlanTier; trialEndsAt: Date | null; trialNotice: TrialNotice; user: { email: string } },
    step: Exclude<TrialStep, 'NONE'>,
    now: Date,
  ) {
    // Solo un proceso avanza cada aviso: si cambió mientras tanto (un pago, otro proceso), no se hace nada.
    const { count } = await this.prisma.professionalProfile.updateMany({
      where: { id: profile.id, trialNotice: profile.trialNotice, planTier: profile.planTier },
      data: { trialNotice: NEXT_NOTICE[step], ...(step === 'EXPIRE' ? { planTier: 'FREE' as const } : {}) },
    });
    if (count === 0 || step === 'CLOSE') return;

    const doctor = { userId: profile.userId, firstName: profile.firstName, email: profile.user.email };
    const frontendUrl = this.config.get('FRONTEND_URL', { infer: true });
    if (step === 'EXPIRE') {
      await recomputeProfessionalStatus(this.prisma, profile.id, now);
      await recomputeDirectoryScore(this.prisma, profile.id);
      await notifyTrialExpired(this.notifications, doctor, frontendUrl);
      return;
    }
    await notifyTrialEnding(this.notifications, doctor, frontendUrl, profile.trialEndsAt!, step === 'ENDS_IN_1_DAY');
  }
}
