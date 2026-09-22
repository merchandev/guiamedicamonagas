import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlanTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { BcvScraperService } from '../exchange-rate/bcv-scraper.service';
import { UpsertPlanDto } from './dto/upsert-plan.dto';
import { UpdateExchangeRateDto } from './dto/exchange-rate.dto';

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

  // --- Suscripción del profesional ---

  async getOwnSubscription(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    return this.prisma.subscription.findFirst({
      where: { professionalId: profile.id },
      include: { plan: true, installments: { include: { payments: true }, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async subscribe(userId: string, planId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');

    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException('Plan no disponible');
    if (plan.tier === 'ORGANIZATION') {
      throw new BadRequestException('Este plan es exclusivo para organizaciones');
    }
    if (plan.tier === 'FREE') {
      throw new BadRequestException('El plan básico es gratuito, no requiere pago');
    }

    const active = await this.prisma.subscription.findFirst({
      where: { professionalId: profile.id, status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE'] } },
    });
    if (active) {
      throw new ConflictException('Ya tienes una suscripción en curso');
    }

    const rate = await this.getExchangeRate();
    const amountBs = Number((Number(plan.priceUsd) * rate.usdToBs).toFixed(2));

    return this.prisma.subscription.create({
      data: {
        professionalId: profile.id,
        planId: plan.id,
        status: 'PENDING',
        installments: {
          create: [{ amountBs, dueDate: new Date(), status: 'PENDING' }],
        },
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

  /** Vence suscripciones activas cuyo periodo terminó y regresa el perfil al plan gratuito. */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async expireOverdueSubscriptions() {
    const now = new Date();
    const overdue = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
      include: { professional: { include: { user: true } } },
    });

    for (const subscription of overdue) {
      await this.prisma.$transaction([
        this.prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'PAST_DUE' } }),
        this.prisma.professionalProfile.update({
          where: { id: subscription.professionalId },
          data: { planTier: PlanTier.FREE },
        }),
      ]);

      await this.notifications.notify({
        userId: subscription.professional.userId,
        type: 'SUBSCRIPTION_EXPIRED',
        title: 'Tu suscripción venció',
        content: 'Tu plan pago venció y tu perfil volvió al plan básico gratuito. Renueva para recuperar tus beneficios.',
      });
    }
  }
}
