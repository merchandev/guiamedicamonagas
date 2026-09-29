import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountListDto, ModerateAccountDto } from './account-management.dto';

export type ManagedRole = 'USER' | 'PROFESSIONAL';

@Injectable()
export class AccountManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(role: ManagedRole, query: AccountListDto, actorId: string, ipAddress?: string) {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      role,
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
              select: { currentPeriodEnd: true, plan: { select: { name: true } } } },
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

  async moderate(id: string, role: ManagedRole, dto: ModerateAccountDto, actorId: string, ipAddress?: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id },
        include: { professionalProfile: { select: { id: true } }, patientProfile: { select: { id: true } } },
      });
      // Nunca modificar administradores, organizaciones ni la propia cuenta por estas rutas.
      if (!user || user.role !== role || id === actorId) throw new NotFoundException('Cuenta no encontrada');
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
        await tx.professionalProfile.update({ where: { id: user.professionalProfile.id }, data: {
          isPublished: false, verificationStatus: active ? 'IN_REVIEW' : 'SUSPENDED',
        } });
        if (!active) await tx.patientDataGrant.updateMany({ where: { professionalId: user.professionalProfile.id, revokedAt: null }, data: { revokedAt: now } });
      }
      if (user.patientProfile && !active) {
        const patientId = user.patientProfile.id;
        await tx.patientDataGrant.updateMany({ where: { patientId, revokedAt: null }, data: { revokedAt: now } });
        await tx.professionalPatient.updateMany({ where: { patientId }, data: { accessRevokedAt: now } });
        await tx.patientProfile.update({ where: { id: patientId }, data: {
          shareCodeEnc: null, shareCodeLookup: null, shareCodeCreatedAt: null, shareScopes: [],
        } });
      }
      await tx.auditLog.create({ data: { userId: actorId, action: `ACCOUNT_${dto.action}`, resource: 'User', resourceId: id,
        details: { role, reason: dto.reason, previousState: user.deletedAt ? 'DELETED' : user.isActive ? 'ACTIVE' : 'SUSPENDED' }, ipAddress } });
      return { id, isActive: active, deletedAt: dto.action === 'DELETE' ? now : null };
    });
  }
}
