import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { paymentReviewedTemplate } from '../mail/mail.templates';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ReportPaymentDto } from './dto/report-payment.dto';
import type { UploadedFileData } from '../common/utils/multipart';

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

  async reportPayment(userId: string, dto: ReportPaymentDto, file: UploadedFileData) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');

    const installment = await this.prisma.subscriptionInstallment.findUnique({
      where: { id: dto.installmentId },
      include: { subscription: true },
    });
    if (!installment || installment.subscription.professionalId !== profile.id) {
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

    if (Number(dto.amountBs) < Number(installment.amountBs)) {
      throw new BadRequestException('El monto reportado es menor al monto de la cuota');
    }

    const key = this.storage.buildKey(`receipts/${profile.id}`, file.filename);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);

    return this.prisma.payment.create({
      data: {
        installmentId: installment.id,
        amountBs: dto.amountBs,
        method: 'PAGO_MOVIL',
        senderBankCode: dto.senderBankCode,
        senderBankName: dto.senderBankName,
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
                include: { professional: { select: { id: true, firstName: true, lastName: true, slug: true } }, plan: true },
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
      include: {
        installment: {
          include: {
            subscription: {
              include: { professional: { include: { user: true } }, plan: true },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.status !== 'PENDING') throw new ConflictException('Este pago ya fue revisado');
    if (!approved && !note) throw new BadRequestException('Debes indicar un motivo al rechazar el pago');

    const subscription = payment.installment.subscription;
    const professional = subscription.professional;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: approved ? 'COMPLETED' : 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), reviewNote: note },
      });

      if (approved) {
        const now = new Date();
        const periodEnd = SubscriptionsService.nextPeriodEnd(now, subscription.plan.billingCycle);
        await tx.subscriptionInstallment.update({ where: { id: payment.installmentId }, data: { status: 'PAID' } });
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd },
        });
        await tx.professionalProfile.update({
          where: { id: subscription.professionalId },
          data: { planTier: subscription.plan.tier },
        });
      }
    });

    await this.audit.record({
      userId: adminId,
      action: approved ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
      resource: 'Payment',
      resourceId: paymentId,
      details: { note, professionalId: professional.id },
      ipAddress,
    });

    const dashboardUrl = `${this.config.get('FRONTEND_URL', { infer: true })}/dashboard/pagos`;
    await this.notifications.notify({
      userId: professional.userId,
      type: approved ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
      title: approved ? 'Pago aprobado' : 'Pago rechazado',
      content: `Bs. ${payment.amountBs.toString()}${note ? ` — ${note}` : ''}`,
      email: {
        to: professional.user.email,
        subject: approved ? 'Pago aprobado — Guía Médica Monagas' : 'Pago rechazado — Guía Médica Monagas',
        html: paymentReviewedTemplate(professional.firstName, approved, payment.amountBs.toString(), note, dashboardUrl),
        template: 'payment_reviewed',
      },
      whatsapp: professional.whatsapp
        ? {
            to: professional.whatsapp,
            template: 'payment_reviewed',
            body: approved
              ? `Tu pago de Bs. ${payment.amountBs.toString()} fue aprobado. Tu suscripción en Guía Médica Monagas ya está activa.`
              : `Tu pago de Bs. ${payment.amountBs.toString()} fue rechazado. Motivo: ${note}. Puedes reportarlo de nuevo desde tu panel.`,
          }
        : undefined,
    });

    return { message: 'Pago revisado' };
  }
}
