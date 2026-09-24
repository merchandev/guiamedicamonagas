import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlanTier, SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { BcvScraperService } from '../exchange-rate/bcv-scraper.service';
import { UpsertPlanDto } from './dto/upsert-plan.dto';
import { UpdateExchangeRateDto } from './dto/exchange-rate.dto';
import { loadSubscriptionOwner } from './subscription-owner';
import { recomputeDirectoryScore } from '../professionals/directory-score';
import { canSubscribeToTier, documentProgress } from '../professionals/publication-rules';

const SUBSCRIPTION_INCLUDE = {
  plan: true,
  installments: { include: { payments: true }, orderBy: { createdAt: 'desc' as const } },
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly exchangeRate: ExchangeRateService,
    private readonly bcvScraper: BcvScraperService,
  ) {}

  // --- Tasa de cambio (los planes se cotizan en USD; Pago Móvil solo admite Bs) ---

  getExchangeRate() {
    return this.exchangeRate.get();
  }

  updateExchangeRate(dto: UpdateExchangeRateDto) {
    return this.exchangeRate.setManual(dto.usdToBs);
  }

  syncExchangeRateFromBcv() {
    return this.bcvScraper.syncNow();
  }

  // --- Catálogo de planes ---

  listPlans() {
    return this.prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceUsd: 'asc' } });
  }

  adminListPlans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { priceUsd: 'asc' } });
  }

  createPlan(dto: UpsertPlanDto) {
    return this.prisma.subscriptionPlan.create({
      data: { ...dto, features: dto.features as never },
    });
  }

  async updatePlan(id: string, dto: UpsertPlanDto) {
    await this.ensurePlanExists(id);
    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: { ...dto, features: dto.features as never },
    });
  }

  async deactivatePlan(id: string) {
    await this.ensurePlanExists(id);
    return this.prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false } });
  }

  private async ensurePlanExists(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
  }

  /**
   * Primera cuota con el monto en Bs FIJADO al momento de suscribirse y la
   * evidencia del cálculo (precio USD, tasa, fuente, fecha valor BCV), para
   * poder reconstruir años después por qué se cobró ese monto.
   */
  private async firstInstallment(plan: SubscriptionPlan) {
    const rate = await this.getExchangeRate();
    if (!Number.isFinite(rate.usdToBs) || rate.usdToBs <= 0) {
      throw new BadRequestException('La tasa de cambio no está disponible. Intenta de nuevo más tarde.');
    }
    const amountBs = Number((Number(plan.priceUsd) * rate.usdToBs).toFixed(2));
    return {
      amountBs,
      dueDate: new Date(),
      status: 'PENDING' as const,
      priceUsd: plan.priceUsd,
      bcvRate: rate.usdToBs,
      rateSource: rate.source,
      rateEffectiveDate: rate.effectiveDate ?? null,
      rateCapturedAt: new Date(),
    };
  }

  private async activePlanOrThrow(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException('Plan no disponible');
    if (plan.tier === 'FREE') {
      throw new BadRequestException('El plan básico es gratuito, no requiere pago');
    }
    return plan;
  }

  // --- Suscripción del profesional ---

  async getOwnSubscription(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    return this.prisma.subscription.findFirst({
      where: { professionalId: profile.id },
      include: SUBSCRIPTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async subscribe(userId: string, planId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      include: { documents: { select: { type: true, status: true, createdAt: true, expiresAt: true } } },
    });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');

    const plan = await this.activePlanOrThrow(planId);
    if (plan.tier === 'ORGANIZATION') {
      throw new BadRequestException('Este plan es exclusivo para organizaciones');
    }
    const documents = documentProgress(profile.isSpecialist, profile.documents);
    if (!canSubscribeToTier(plan.tier, documents)) {
      throw new ForbiddenException(
        `Para contratar ${plan.name} necesitas el 100% de tus documentos aprobados (tienes ${documents.approved} de ${documents.required})`,
      );
    }

    const active = await this.prisma.subscription.findFirst({
      where: { professionalId: profile.id, status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE'] } },
    });
    if (active) {
      throw new ConflictException('Ya tienes una suscripción en curso');
    }

    return this.prisma.subscription.create({
      data: {
        professionalId: profile.id,
        planId: plan.id,
        status: 'PENDING',
        installments: { create: [await this.firstInstallment(plan)] },
      },
      include: { plan: true, installments: true },
    });
  }

  // --- Suscripción de una organización (farmacia/laboratorio/clínica) ---

  private async assertOrgManager(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Solo el dueño o un administrador de la organización puede gestionar el plan');
    }
  }

  async getOrganizationSubscription(userId: string, organizationId: string) {
    await this.assertOrgManager(userId, organizationId);
    return this.prisma.subscription.findFirst({
      where: { organizationId },
      include: SUBSCRIPTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async subscribeOrganization(userId: string, organizationId: string) {
    await this.assertOrgManager(userId, organizationId);
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { tier: 'ORGANIZATION' } });
    if (!plan || !plan.isActive) throw new NotFoundException('El plan de organizaciones no está disponible');

    const active = await this.prisma.subscription.findFirst({
      where: { organizationId, status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE'] } },
    });
    if (active) throw new ConflictException('Esta organización ya tiene una suscripción en curso');

    return this.prisma.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        status: 'PENDING',
        installments: { create: [await this.firstInstallment(plan)] },
      },
      include: { plan: true, installments: true },
    });
  }

  static nextPeriodEnd(from: Date, cycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'): Date {
    const end = new Date(from);
    if (cycle === 'MONTHLY') end.setMonth(end.getMonth() + 1);
    if (cycle === 'QUARTERLY') end.setMonth(end.getMonth() + 3);
    if (cycle === 'YEARLY') end.setFullYear(end.getFullYear() + 1);
    return end;
  }

  /** Vence suscripciones activas cuyo periodo terminó y regresa al titular al plan gratuito. */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async expireOverdueSubscriptions() {
    const now = new Date();
    const overdue = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
    });

    for (const subscription of overdue) {
      await this.prisma.$transaction([
        this.prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'PAST_DUE' } }),
        subscription.professionalId
          ? this.prisma.professionalProfile.update({
              where: { id: subscription.professionalId },
              data: { planTier: PlanTier.FREE },
            })
          : this.prisma.organization.update({
              where: { id: subscription.organizationId! },
              data: { planTier: PlanTier.FREE },
            }),
      ]);

      if (subscription.professionalId) {
        await recomputeDirectoryScore(this.prisma, subscription.professionalId);
      }

      const owner = await loadSubscriptionOwner(this.prisma, subscription);
      for (const recipient of owner.recipients) {
        await this.notifications.notify({
          userId: recipient.userId,
          type: 'SUBSCRIPTION_EXPIRED',
          title: 'Tu suscripción venció',
          content:
            'El plan pago venció y el perfil volvió al plan básico gratuito (sigue verificado y visible). Renueva para recuperar los beneficios.',
        });
      }
    }
  }
}
