import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PatientDataCodec } from '../patients/patient-data.codec';
import { accountModeratedTemplate } from '../mail/mail.templates';
import { recomputeProfessionalStatus } from '../professionals/publication-rules';
import { AccountListDto, ModerateAccountDto } from './account-management.dto';

export type ManagedRole = 'USER' | 'PROFESSIONAL';

const NOTICE_TITLES: Record<ModerateAccountDto['action'], string> = {
  SUSPEND: 'Tu cuenta fue suspendida',
  DELETE: 'Tu cuenta fue dada de baja',
  RESTORE: 'Tu cuenta fue reactivada',
};

@Injectable()
export class AccountManagementService {
  private readonly logger = new Logger(AccountManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly codec: PatientDataCodec,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async list(role: ManagedRole, query: AccountListDto, actorId: string, ipAddress?: string) {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      role,
      // Las cuentas eliminadas definitivamente ya no tienen datos que gestionar.
      purgedAt: null,
      ...(query.status === 'DELETED' ? { deletedAt: { not: null } } : { deletedAt: null }),
      ...(query.status === 'ACTIVE' ? { isActive: true } : query.status === 'SUSPENDED' ? { isActive: false } : {}),
      ...(search ? { OR: [
        { email: { contains: search, mode: 'insensitive' } },
        ...(role === 'PROFESSIONAL' ? [
          { professionalProfile: { firstName: { contains: search, mode: 'insensitive' as const } } },
          { professionalProfile: { lastName: { contains: search, mode: 'insensitive' as const } } },
        ] : [
          { patientProfile: { patientCode: { contains: search, mode: 'insensitive' as const } } },
          { patientProfile: { firstName: { contains: search, mode: 'insensitive' as const } } },
          { patientProfile: { lastName: { contains: search, mode: 'insensitive' as const } } },
          ...this.patientLookupFilters(search),
        ]),
      ] } : {}),
    };
    const page = query.page ?? 1;
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.user.findMany({ where, skip: (page - 1) * 20, take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: { id: true, email: true, isActive: true, deletedAt: true, moderationReason: true, isEmailVerified: true,
          professionalProfile: { select: { id: true, firstName: true, lastName: true, slug: true, planTier: true,
            isPublished: true, verificationStatus: true,
            subscriptions: { where: { status: 'ACTIVE' }, take: 1, orderBy: { createdAt: 'desc' },
              select: { currentPeriodEnd: true, plan: { select: { id: true, name: true } } } },
          } },
          patientProfile: { select: { patientCode: true, firstName: true, lastName: true } },
        },
      });
      const total = await tx.user.count({ where });
      // No registrar el texto buscado: puede contener identidad de pacientes.
      await tx.auditLog.create({ data: { userId: actorId, action: 'ADMIN_ACCOUNTS_LISTED', resource: 'User',
        details: { role, page, count: items.length }, ipAddress } });
      return { items, total, page, totalPages: Math.ceil(total / 20) };
    });
  }

  /**
   * La cédula y el teléfono del paciente están cifrados: solo se encuentran por
   * coincidencia exacta con su hash, nunca descifrando la tabla.
   */
  private patientLookupFilters(search: string): Prisma.UserWhereInput[] {
    const compact = search.replace(/[\s.]/g, '');
    const filters: Prisma.UserWhereInput[] = [];
    if (/^[VEJPG]-?\d{5,9}$/i.test(compact)) {
      filters.push({ patientProfile: { cedulaLookup: this.codec.cedulaLookup(compact) } });
    }
    if (/^0?4\d{2}-?\d{7}$/.test(compact)) {
      filters.push({ patientProfile: { phoneLookup: this.codec.phoneLookup(compact) } });
    }
    return filters;
  }

  async moderate(id: string, role: ManagedRole, dto: ModerateAccountDto, actorId: string, ipAddress?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id },
        include: {
          professionalProfile: { select: { id: true, firstName: true } },
          patientProfile: { select: { id: true, firstName: true } },
        },
      });
      // Nunca modificar administradores, organizaciones ni la propia cuenta por estas rutas.
      if (!user || user.role !== role || id === actorId || user.purgedAt) throw new NotFoundException('Cuenta no encontrada');
      if (dto.action === 'SUSPEND' && user.deletedAt) throw new ConflictException('La cuenta ya está dada de baja');
      if ((dto.action === 'DELETE' && user.deletedAt) || (dto.action === 'SUSPEND' && !user.isActive) ||
          (dto.action === 'RESTORE' && user.isActive && !user.deletedAt)) {
        throw new ConflictException('La cuenta ya tiene ese estado. Actualiza la lista.');
      }
      const now = new Date();
      const active = dto.action === 'RESTORE';
      // CAS: dos cambios simultáneos no pisan el estado ni restauran sesiones viejas.
      const changed = await tx.user.updateMany({ where: { id, role, tokenVersion: user.tokenVersion }, data: {
        isActive: active, deletedAt: dto.action === 'DELETE' ? now : null,
        moderationReason: dto.reason, tokenVersion: { increment: 1 },
      } });
      if (changed.count !== 1) throw new ConflictException('La cuenta cambió. Actualiza la lista y vuelve a intentarlo.');
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });
      await tx.verificationToken.deleteMany({ where: { userId: id } });
      await tx.patientVaultSession.updateMany({ where: { userId: id, closedAt: null }, data: { closedAt: now } });
      if (user.professionalProfile) {
        // Al reactivar se sale de SUSPENDED y, fuera de la transacción, se
        // recalcula verificación y publicación con sus documentos (abajo).
        await tx.professionalProfile.update({ where: { id: user.professionalProfile.id }, data: {
          isPublished: false, verificationStatus: active ? 'IN_REVIEW' : 'SUSPENDED',
        } });
        if (!active) await tx.patientDataGrant.updateMany({ where: { professionalId: user.professionalProfile.id, revokedAt: null }, data: { revokedAt: now } });
      }
      if (user.patientProfile && !active) {
        const patientId = user.patientProfile.id;
        await tx.patientDataGrant.updateMany({ where: { patientId, revokedAt: null }, data: { revokedAt: now } });
        await tx.professionalPatient.updateMany({ where: { patientId }, data: { accessRevokedAt: now } });
        // Se invalida el código; qué datos compartiría (shareScopes) es una
        // preferencia del paciente y se conserva para cuando genere uno nuevo.
        await tx.patientProfile.update({ where: { id: patientId }, data: {
          shareCodeEnc: null, shareCodeLookup: null, shareCodeCreatedAt: null,
        } });
      }
      await tx.auditLog.create({ data: { userId: actorId, action: `ACCOUNT_${dto.action}`, resource: 'User', resourceId: id,
        details: { role, reason: dto.reason, previousState: user.deletedAt ? 'DELETED' : user.isActive ? 'ACTIVE' : 'SUSPENDED' }, ipAddress } });
      return {
        response: { id, isActive: active, deletedAt: dto.action === 'DELETE' ? now : null },
        email: user.email,
        displayName: user.professionalProfile
          ? `Dr(a). ${user.professionalProfile.firstName}`
          : user.patientProfile?.firstName ?? 'Paciente',
        professionalId: user.professionalProfile?.id ?? null,
      };
    });

    // Igual que al reactivar desde «Médicos»: sus documentos deciden la
    // verificación y las reglas de publicación, si vuelve al directorio.
    if (dto.action === 'RESTORE' && result.professionalId) {
      await recomputeProfessionalStatus(this.prisma, result.professionalId);
    }
    await this.notifyHolder(id, dto, result.email, result.displayName);
    return result.response;
  }

  /** El titular recibe el motivo por correo; un fallo de envío no deshace la moderación. */
  private async notifyHolder(userId: string, dto: ModerateAccountDto, email: string, displayName: string) {
    const loginUrl = `${this.config.get('FRONTEND_URL', { infer: true })}/iniciar-sesion`;
    try {
      await this.notifications.notify({
        userId,
        type: `ACCOUNT_${dto.action}`,
        title: NOTICE_TITLES[dto.action],
        content: `Motivo: ${dto.reason}`,
        email: {
          to: email,
          subject: `${NOTICE_TITLES[dto.action]} — Guía Médica Monagas`,
          template: `account_${dto.action.toLowerCase()}`,
          html: accountModeratedTemplate(displayName, dto.action, dto.reason, loginUrl),
        },
      });
    } catch (error) {
      this.logger.warn(`No se pudo avisar al titular de la cuenta ${userId}: ${(error as Error).message}`);
    }
  }
}
