import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { recomputeProfessionalStatus } from '../professionals/publication-rules';
import { TRIAL_TIER } from '../subscriptions/plan-tiers';
import { paidPeriodAnchor } from '../subscriptions/plan-trial';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { ReportPaymentDto } from './dto/report-payment.dto';
import { UpdatePagoMovilAccountDto } from './dto/update-pago-movil-account.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission } from '../common/permissions';

const PAGO_MOVIL_ACCOUNT_KEY = 'pago_movil_account';

interface StoredPagoMovilAccount {
  holderName: string;
  documentId: string;
  bankCode: string;
  accountNumber: string;
  phone: string;
}

export type PagoMovilAccount = { configured: boolean; bankName: string | null } & {
  [K in keyof StoredPagoMovilAccount]: StoredPagoMovilAccount[K] | null;
};

/** V12345678 → V-12345678. El dígito verificador de un RIF se deja como se escribió. */
function formatDocumentId(raw: string): string {
  return `${raw[0]}-${raw.slice(1).replace(/^-/, '')}`;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Cuenta que recibe los Pagos Móviles. La registra la administración en
   * «Pagos» (antes venía de variables del servidor, con valores de ejemplo).
   * Mientras no exista, `configured` es false y el panel no ofrece reportar
   * un pago.
   */
  async getPagoMovilAccount(): Promise<PagoMovilAccount> {
    const row = await this.prisma.siteSettings.findUnique({ where: { key: PAGO_MOVIL_ACCOUNT_KEY } });
    const saved = row?.value as unknown as StoredPagoMovilAccount | undefined;
    if (!saved) {
      return { configured: false, holderName: null, documentId: null, bankCode: null, bankName: null, accountNumber: null, phone: null };
    }
    const bank = await this.prisma.financialInstitution.findUnique({ where: { code: saved.bankCode }, select: { name: true } });
    return { configured: true, ...saved, bankName: bank?.name ?? saved.bankCode };
  }

  /** Un paciente o una cuenta sin suscripción posible no necesita ver a dónde se paga. */
  async getPagoMovilAccountForPayer(user: Pick<AuthenticatedUser, 'id' | 'role'>) {
    const payer =
      user.role === 'PROFESSIONAL' ||
      user.role === 'ORGANIZATION' ||
      !!(await this.prisma.organizationMember.findFirst({ where: { userId: user.id }, select: { id: true } }));
    if (!payer) throw new ForbiddenException('Estos datos se muestran en el panel de médicos y organizaciones');
    return this.getPagoMovilAccount();
  }

  async updatePagoMovilAccount(dto: UpdatePagoMovilAccountDto, adminId: string, ipAddress?: string) {
    const bank = await this.prisma.financialInstitution.findUnique({ where: { code: dto.bankCode } });
    if (!bank || !bank.isActive || !bank.supportsPagoMovil) {
      throw new BadRequestException('Ese banco no está activo para Pago Móvil en el catálogo de bancos');
    }
    // Las cuentas venezolanas tienen 20 dígitos y empiezan por el código del banco.
    if (!dto.accountNumber.startsWith(dto.bankCode)) {
      throw new BadRequestException(`El número de cuenta debe empezar por el código del banco (${dto.bankCode})`);
    }
    const value: StoredPagoMovilAccount = {
      holderName: dto.holderName,
      documentId: formatDocumentId(dto.documentId),
      bankCode: dto.bankCode,
      accountNumber: dto.accountNumber,
      phone: `${dto.phone.slice(0, 4)}-${dto.phone.slice(4)}`,
    };
    const previous = await this.getPagoMovilAccount();
    await this.prisma.siteSettings.upsert({
      where: { key: PAGO_MOVIL_ACCOUNT_KEY },
      create: { key: PAGO_MOVIL_ACCOUNT_KEY, value: value as never },
      update: { value: value as never },
    });
    // A dónde llega el dinero: cada cambio queda registrado con quién lo hizo.
    const changed = (Object.keys(value) as (keyof StoredPagoMovilAccount)[]).filter((field) => previous[field] !== value[field]);
    await this.audit.record({
      userId: adminId,
      action: 'PAGO_MOVIL_ACCOUNT_UPDATED',
      resource: 'SiteSettings',
      resourceId: PAGO_MOVIL_ACCOUNT_KEY,
      details: { changed, bankCode: value.bankCode, accountEnding: value.accountNumber.slice(-4), phoneEnding: value.phone.slice(-4) },
      ipAddress,
    });
    return this.getPagoMovilAccount();
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

    try {
      const payment = await this.prisma.payment.create({
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
      await this.notifications.notifyStaff(Permission.REVIEW_PAYMENTS, {
        type: 'PAYMENT_REPORTED',
        title: 'Pago por revisar',
        content: `Pago Móvil de Bs. ${payment.amountBs.toString()} (${bank.name}, referencia ${dto.referenceNumber}).`,
        link: '/admin/pagos',
      });
      return payment;
    } catch (error) {
      // Dos reportes simultáneos con la misma referencia pasan la comprobación
      // de arriba; el índice único parcial "Payment_reference_active_unique"
      // deja entrar solo a uno. El comprobante del perdedor no se conserva.
      if (isUniqueViolation(error)) {
        await this.storage.deleteObject(key).catch(() => undefined);
        throw new ConflictException('Esta referencia de Pago Móvil ya fue reportada');
      }
      throw error;
    }
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

  async adminReceiptUrl(paymentId: string, adminId: string, ipAddress?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || !payment.receiptFileKey) throw new NotFoundException('Pago no encontrado');
    const url = await this.storage.getSignedDownloadUrl(payment.receiptFileKey);
    // El comprobante trae datos bancarios del titular: cada apertura queda registrada.
    await this.audit.record({
      userId: adminId,
      action: 'PAYMENT_RECEIPT_VIEWED',
      resource: 'Payment',
      resourceId: payment.id,
      ipAddress,
    });
    return { url };
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
        // Pagado durante la prueba gratuita: los días que le quedaban se suman al plan.
        const doctor = subscription.professionalId
          ? await tx.professionalProfile.findUnique({
              where: { id: subscription.professionalId },
              select: { planTier: true, trialEndsAt: true, trialNotice: true },
            })
          : null;
        const anchor = doctor ? paidPeriodAnchor(now, doctor, TRIAL_TIER) : now;
        const periodEnd = SubscriptionsService.nextPeriodEnd(anchor, subscription.plan.billingCycle);
        await tx.subscriptionInstallment.update({ where: { id: payment.installmentId }, data: { status: 'PAID' } });
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd },
        });
        if (subscription.professionalId) {
          // Con un plan pagado ya no hay prueba gratuita (ni sus avisos).
          await tx.professionalProfile.update({
            where: { id: subscription.professionalId },
            data: { planTier: subscription.plan.tier, trialNotice: 'CLOSED' },
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
      // Con el plan activo vuelve al directorio (si cumple el resto de los requisitos).
      await recomputeProfessionalStatus(this.prisma, subscription.professionalId);
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
        link: owner.dashboardPath,
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
