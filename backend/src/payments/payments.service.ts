import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { paymentReviewedTemplate } from '../mail/mail.templates';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { loadSubscriptionOwner, userManagesSubscription } from '../subscriptions/subscription-owner';
import type { SecuredFile } from '../uploads/upload-security.service';
import { recomputeDirectoryScore } from '../professionals/directory-score';
import { ReportPaymentDto } from './dto/report-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async getPagoMovilAccount() {
    return {
      bankName: this.config.get('PAGO_MOVIL_BANK_NAME', { infer: true }),
      bankCode: this.config.get('PAGO_MOVIL_BANK_CODE', { infer: true }),
      phone: this.config.get('PAGO_MOVIL_PHONE', { infer: true }),
      documentId: this.config.get('PAGO_MOVIL_ID', { infer: true }),
    };
  }

  listBanks() {
    return this.prisma.financialInstitution.findMany({
      where: { isActive: true },
      select: { code: true, name: true, supportsPagoMovil: true },
      orderBy: { code: 'asc' },
    });
  }

  async reportPayment(userId: string, dto: ReportPaymentDto, file: SecuredFile) {
    const installment = await this.prisma.subscriptionInstallment.findUnique({
      where: { id: dto.installmentId },
      include: { subscription: true },
    });
    if (!installment || !(await userManagesSubscription(this.prisma, userId, installment.subscription))) {
      throw new NotFoundException('Cuota no encontrada');
    }
    if (installment.status === 'PAID') {
      throw new ConflictException('Esta cuota ya fue pagada');
    }

    const pendingPayment = await this.prisma.payment.findFirst({
      where: { installmentId: installment.id, status: 'PENDING' },
    });
    if (pendingPayment) {
      throw new ConflictException('Ya reportaste un pago para esta cuota, está pendiente de revisión');
    }

    const bank = await this.prisma.financialInstitution.findUnique({ where: { code: dto.senderBankCode } });
    if (!bank || !bank.isActive) {
      throw new BadRequestException('Banco emisor no reconocido');
    }

    // Una misma referencia de Pago Móvil del mismo banco no puede usarse para
    // dos pagos (salvo que el anterior haya sido rechazado, p.ej. por un error
    // de tipeo del propio titular).
    const reusedReference = await this.prisma.payment.findFirst({
      where: { senderBankCode: dto.senderBankCode, referenceNumber: dto.referenceNumber, status: { not: 'REJECTED' } },
      select: { id: true },
    });
    if (reusedReference) {
      throw new ConflictException('Esta referencia de Pago Móvil ya fue reportada');
    }

    if (Number(dto.amountBs) < Number(installment.amountBs)) {
      throw new BadRequestException('El monto reportado es menor al monto de la cuota');
    }

    const ownerId = installment.subscription.professionalId ?? installment.subscription.organizationId;
    const key = this.storage.buildKey(`receipts/${ownerId}`, file.extension);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);

    return this.prisma.payment.create({
      data: {
        installmentId: installment.id,
        amountBs: dto.amountBs,
        method: 'PAGO_MOVIL',
        senderBankCode: bank.code,
        senderBankName: bank.name,
        senderPhone: dto.senderPhone,
        referenceNumber: dto.referenceNumber,
        paidAt: new Date(dto.paidAt),
        receiptFileKey: key,
        status: 'PENDING',
      },
    });
  }

  async adminQueue(params: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const where = { status: (params.status as never) || undefined };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          installment: {
            include: {
              subscription: {
                include: {
                  professional: { select: { id: true, firstName: true, lastName: true, slug: true } },
                  organization: { select: { id: true, name: true, slug: true, type: true } },
                  plan: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async adminReceiptUrl(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || !payment.receiptFileKey) throw new NotFoundException('Pago no encontrado');
    return { url: await this.storage.getSignedDownloadUrl(payment.receiptFileKey) };
  }

  async adminReview(paymentId: string, adminId: string, approved: boolean, note: string | undefined, ipAddress?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { installment: { include: { subscription: { include: { plan: true } } } } },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.status !== 'PENDING') throw new ConflictException('Este pago ya fue revisado');
    if (!approved && !note) throw new BadRequestException('Debes indicar un motivo al rechazar el pago');

    const subscription = payment.installment.subscription;

    await this.prisma.$transaction(async (tx) => {
      // Idempotencia ante doble clic / dos admins a la vez: solo una revisión
      // pasa de PENDING al estado final.
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: approved ? 'COMPLETED' : 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), reviewNote: note },
      });
      if (count === 0) throw new ConflictException('Este pago ya fue revisado');

      if (approved) {
        const now = new Date();
        const periodEnd = SubscriptionsService.nextPeriodEnd(now, subscription.plan.billingCycle);
        await tx.subscriptionInstallment.update({ where: { id: payment.installmentId }, data: { status: 'PAID' } });
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd },
        });
        if (subscription.professionalId) {
          await tx.professionalProfile.update({
            where: { id: subscription.professionalId },
            data: { planTier: subscription.plan.tier },
          });
        } else {
          await tx.organization.update({
            where: { id: subscription.organizationId! },
            data: { planTier: subscription.plan.tier },
          });
        }
      }
    });

    if (approved && subscription.professionalId) {
      await recomputeDirectoryScore(this.prisma, subscription.professionalId);
    }

    const owner = await loadSubscriptionOwner(this.prisma, subscription);

    await this.audit.record({
      userId: adminId,
      action: approved ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
      resource: 'Payment',
      resourceId: paymentId,
      details: { note, ownerKind: owner.kind, ownerId: owner.id },
      ipAddress,
    });

    const dashboardUrl = `${this.config.get('FRONTEND_URL', { infer: true })}${owner.dashboardPath}`;
    const amount = payment.amountBs.toString();
    for (const [index, recipient] of owner.recipients.entries()) {
      await this.notifications.notify({
        userId: recipient.userId,
        type: approved ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
        title: approved ? 'Pago aprobado' : 'Pago rechazado',
        content: `Bs. ${amount}${note ? ` — ${note}` : ''}`,
        email: {
          to: recipient.email,
          subject: approved ? 'Pago aprobado — Guía Médica Monagas' : 'Pago rechazado — Guía Médica Monagas',
          html: paymentReviewedTemplate(owner.displayName, approved, amount, note, dashboardUrl),
          template: 'payment_reviewed',
        },
        whatsapp:
          index === 0 && owner.whatsapp
            ? {
                to: owner.whatsapp,
                template: 'payment_reviewed',
                body: approved
                  ? `Tu pago de Bs. ${amount} fue aprobado. Tu suscripción en Guía Médica Monagas ya está activa.`
                  : `Tu pago de Bs. ${amount} fue rechazado. Motivo: ${note}. Puedes reportarlo de nuevo desde tu panel.`,
              }
            : undefined,
      });
    }

    return { message: 'Pago revisado' };
  }
}
