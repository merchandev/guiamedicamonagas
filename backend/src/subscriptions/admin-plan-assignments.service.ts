import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paidPlanAssignedTemplate } from '../mail/mail.templates';
import { canSubscribeToTier, documentProgress } from '../professionals/publication-rules';
import { recomputeDirectoryScore } from '../professionals/directory-score';
import { SubscriptionsService } from './subscriptions.service';
import { AssignPaidPlanDto } from './dto/assign-paid-plan.dto';

@Injectable()
export class AdminPlanAssignmentsService {
  private readonly logger = new Logger(AdminPlanAssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async assign(professionalId: string, dto: AssignPaidPlanDto, actorId: string, ipAddress?: string) {
    const now = new Date();
    const paidAt = new Date(dto.paidAt);
    const periods = dto.periods ?? 1;
    if (!Number.isFinite(paidAt.getTime()) || paidAt > now) throw new BadRequestException('La fecha de pago no puede estar en el futuro');
    let result: {
      subscription: { id: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null };
      renewed: boolean;
      notice: { userId: string; email: string; firstName: string; planName: string };
    };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const professional = await tx.professionalProfile.findUnique({ where: { id: professionalId },
          include: { user: true, documents: { select: { type: true, status: true, createdAt: true, expiresAt: true } } },
        });
        if (!professional || professional.user.role !== 'PROFESSIONAL') throw new NotFoundException('Médico no encontrado');
        if (!professional.user.isActive || professional.user.deletedAt || professional.verificationStatus === 'SUSPENDED') {
          throw new ConflictException('No se puede asignar un plan a una cuenta o perfil suspendido o dado de baja');
        }
        const plan = await tx.subscriptionPlan.findUnique({ where: { id: dto.planId } });
        if (!plan?.isActive || plan.tier === 'FREE' || plan.tier === 'ORGANIZATION') {
          throw new BadRequestException('Selecciona un plan de pago activo para médicos');
        }
        if (!canSubscribeToTier(plan.tier, documentProgress(professional.isSpecialist, professional.documents))) {
          throw new BadRequestException('Este plan exige todos los documentos aprobados; el pago no sustituye la verificación');
        }
        const bank = await tx.financialInstitution.findUnique({ where: { code: dto.senderBankCode } });
        if (!bank?.isActive || (dto.method === 'PAGO_MOVIL' && !bank.supportsPagoMovil)) throw new BadRequestException('Banco o método no disponible');
        const duplicate = await tx.payment.findFirst({ where: {
          senderBankCode: dto.senderBankCode, referenceNumber: dto.referenceNumber, status: { not: 'REJECTED' },
        } });
        if (duplicate) throw new ConflictException('Esta referencia ya fue registrada. Revisa el pago existente.');
        const pending = await tx.payment.findFirst({ where: { status: 'PENDING', installment: { subscription: { professionalId } } } });
        if (pending) throw new ConflictException('Hay un pago pendiente de revisión. Apruébalo o recházalo desde Pagos antes de asignar otro plan.');

        // Renovación anticipada del mismo plan: el pago se suma al final del
        // período vigente, así el médico no pierde los días que ya pagó.
        const current = await tx.subscription.findFirst({
          where: { professionalId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        });
        const renewing = !!current && current.planId === plan.id && !!current.currentPeriodEnd && current.currentPeriodEnd > paidAt;
        let periodEnd = renewing ? current!.currentPeriodEnd! : paidAt;
        for (let i = 0; i < periods; i += 1) periodEnd = SubscriptionsService.nextPeriodEnd(periodEnd, plan.billingCycle);
        if (periodEnd <= now) throw new BadRequestException('El período de ese pago ya venció');

        const installment = { amountBs: dto.amountBs, priceUsd: plan.priceUsd, dueDate: paidAt, status: 'PAID' as const,
          // No inventar una cotización histórica: el admin registra el importe real recibido.
          rateSource: 'ADMIN_RECORDED_PAYMENT',
          payments: { create: { amountBs: dto.amountBs, method: dto.method, senderBankCode: bank.code, senderBankName: bank.name,
            referenceNumber: dto.referenceNumber, paidAt, status: 'COMPLETED' as const, reviewedById: actorId,
            reviewedAt: now, reviewNote: dto.reason } },
        };
        const select = { id: true, currentPeriodStart: true, currentPeriodEnd: true };
        let subscription;
        if (renewing) {
          await tx.subscription.updateMany({ where: { professionalId, id: { not: current!.id }, status: { in: ['PENDING', 'PAST_DUE', 'UNPAID'] } }, data: { status: 'CANCELED' } });
          subscription = await tx.subscription.update({ where: { id: current!.id },
            data: { currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, installments: { create: installment } }, select });
        } else {
          // Otro plan (o ninguno vigente): reemplaza la suscripción anterior sin prorrateo.
          await tx.subscription.updateMany({ where: { professionalId, status: { in: ['ACTIVE', 'PENDING', 'PAST_DUE', 'UNPAID'] } }, data: { status: 'CANCELED' } });
          subscription = await tx.subscription.create({ data: {
            professionalId, planId: plan.id, status: 'ACTIVE', currentPeriodStart: paidAt, currentPeriodEnd: periodEnd,
            installments: { create: installment },
          }, select });
        }
        await tx.professionalProfile.update({ where: { id: professionalId }, data: { planTier: plan.tier } });
        await recomputeDirectoryScore(tx, professionalId);
        await tx.auditLog.create({ data: { userId: actorId, action: 'PAID_PLAN_ASSIGNED', resource: 'Subscription', resourceId: subscription.id,
          details: { professionalId, previousTier: professional.planTier, planId: plan.id, amountBs: dto.amountBs, periods, renewed: renewing,
            periodEnd: periodEnd.toISOString(), referenceNumber: dto.referenceNumber, reason: dto.reason }, ipAddress } });
        return {
          subscription,
          renewed: renewing,
          notice: { userId: professional.userId, email: professional.user.email, firstName: professional.firstName, planName: plan.name },
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') throw new ConflictException('La referencia ya fue utilizada');
      if (code === 'P2034') throw new ConflictException('Otro proceso modificó la cuenta o sus pagos. Actualiza y vuelve a intentarlo.');
      throw error;
    }

    await this.notifyDoctor(result.notice, result.subscription.currentPeriodEnd!);
    return { ...result.subscription, renewed: result.renewed };
  }

  /** Mismo canal que al aprobar un Pago Móvil: aviso en el panel y correo. */
  private async notifyDoctor(notice: { userId: string; email: string; firstName: string; planName: string }, endsAt: Date) {
    const endsAtLabel = endsAt.toLocaleDateString('es-VE', { dateStyle: 'long', timeZone: 'America/Caracas' });
    try {
      await this.notifications.notify({
        userId: notice.userId,
        type: 'PAID_PLAN_ASSIGNED',
        title: 'Tu plan está activo',
        content: `${notice.planName} vigente hasta el ${endsAtLabel}.`,
        email: {
          to: notice.email,
          subject: 'Tu plan está activo — Guía Médica Monagas',
          template: 'paid_plan_assigned',
          html: paidPlanAssignedTemplate(`Dr(a). ${notice.firstName}`, notice.planName, endsAtLabel,
            `${this.config.get('FRONTEND_URL', { infer: true })}/dashboard/pagos`),
        },
      });
    } catch (error) {
      this.logger.warn(`No se pudo avisar al médico del plan asignado: ${(error as Error).message}`);
    }
  }
}
