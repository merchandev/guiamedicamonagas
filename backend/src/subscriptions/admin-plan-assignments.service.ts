import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canSubscribeToTier, documentProgress } from '../professionals/publication-rules';
import { recomputeDirectoryScore } from '../professionals/directory-score';
import { SubscriptionsService } from './subscriptions.service';
import { AssignPaidPlanDto } from './dto/assign-paid-plan.dto';

@Injectable()
export class AdminPlanAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(professionalId: string, dto: AssignPaidPlanDto, actorId: string, ipAddress?: string) {
    const now = new Date();
    const paidAt = new Date(dto.paidAt);
    if (!Number.isFinite(paidAt.getTime()) || paidAt > now) throw new BadRequestException('La fecha de pago no puede estar en el futuro');
    try {
      return await this.prisma.$transaction(async (tx) => {
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
        const periodEnd = SubscriptionsService.nextPeriodEnd(paidAt, plan.billingCycle);
        if (periodEnd <= now) throw new BadRequestException('El período de ese pago ya venció');
        const bank = await tx.financialInstitution.findUnique({ where: { code: dto.senderBankCode } });
        if (!bank?.isActive || (dto.method === 'PAGO_MOVIL' && !bank.supportsPagoMovil)) throw new BadRequestException('Banco o método no disponible');
        const duplicate = await tx.payment.findFirst({ where: {
          senderBankCode: dto.senderBankCode, referenceNumber: dto.referenceNumber, status: { not: 'REJECTED' },
        } });
        if (duplicate) throw new ConflictException('Esta referencia ya fue registrada. Revisa el pago existente.');
        const pending = await tx.payment.findFirst({ where: { status: 'PENDING', installment: { subscription: { professionalId } } } });
        if (pending) throw new ConflictException('Hay un pago pendiente de revisión. Apruébalo o recházalo desde Pagos antes de asignar otro plan.');
        await tx.subscription.updateMany({ where: { professionalId, status: { in: ['ACTIVE', 'PENDING', 'PAST_DUE', 'UNPAID'] } }, data: { status: 'CANCELED' } });
        const subscription = await tx.subscription.create({ data: {
          professionalId, planId: plan.id, status: 'ACTIVE', currentPeriodStart: paidAt, currentPeriodEnd: periodEnd,
          installments: { create: { amountBs: dto.amountBs, priceUsd: plan.priceUsd, dueDate: paidAt, status: 'PAID',
            // No inventar una cotización histórica: el admin registra el importe real recibido.
            rateSource: 'ADMIN_RECORDED_PAYMENT',
            payments: { create: { amountBs: dto.amountBs, method: dto.method, senderBankCode: bank.code, senderBankName: bank.name,
              referenceNumber: dto.referenceNumber, paidAt, status: 'COMPLETED', reviewedById: actorId,
              reviewedAt: now, reviewNote: dto.reason } },
          } },
        }, select: { id: true, currentPeriodStart: true, currentPeriodEnd: true } });
        await tx.professionalProfile.update({ where: { id: professionalId }, data: { planTier: plan.tier } });
        await recomputeDirectoryScore(tx, professionalId);
        await tx.auditLog.create({ data: { userId: actorId, action: 'PAID_PLAN_ASSIGNED', resource: 'Subscription', resourceId: subscription.id,
          details: { professionalId, previousTier: professional.planTier, planId: plan.id, amountBs: dto.amountBs,
            referenceNumber: dto.referenceNumber, reason: dto.reason }, ipAddress } });
        return subscription;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') throw new ConflictException('La referencia ya fue utilizada');
      if (code === 'P2034') throw new ConflictException('Otro proceso modificó la cuenta o sus pagos. Actualiza y vuelve a intentarlo.');
      throw error;
    }
  }
}
