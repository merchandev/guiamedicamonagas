import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AccountPurgeService } from './account-purge.service';
import type { ManagedRole } from './account-management.service';

const GRACE_DAYS = 30;

/**
 * Purga las cuentas que el propio usuario pidió eliminar (Google Play) una vez
 * vencido el período de gracia. Volver a iniciar sesión limpia
 * `deletionRequestedAt`, así que aquí solo llegan las que nadie reabrió.
 */
@Injectable()
export class AccountDeletionCron {
  private readonly logger = new Logger(AccountDeletionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purge: AccountPurgeService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredDeletions() {
    const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000);
    const due = await this.prisma.user.findMany({
      where: { deletionRequestedAt: { lte: cutoff }, purgedAt: null, role: { in: ['USER', 'PROFESSIONAL'] } },
      select: { id: true, role: true },
    });
    if (!due.length) return;

    // La purga se audita a nombre de un administrador real (FK de AuditLog).
    const admin = await this.prisma.user.findFirst({
      where: { role: 'SUPERADMIN', isActive: true, deletionRequestedAt: null, purgedAt: null },
      select: { id: true },
    });
    if (!admin) {
      this.logger.error('No hay SUPERADMIN activo para auditar la purga; se reintenta en el próximo ciclo.');
      return;
    }

    for (const user of due) {
      try {
        // AccountPurgeService.purge exige la cuenta desactivada: la dejamos así primero.
        await this.prisma.user.update({ where: { id: user.id }, data: { isActive: false, deletedAt: new Date() } });
        await this.purge.purge(
          user.id,
          user.role as ManagedRole,
          'Período de gracia de eliminación vencido (solicitada por el usuario)',
          admin.id,
        );
        this.logger.log(`Cuenta ${user.id} purgada tras el período de gracia de ${GRACE_DAYS} días.`);
      } catch (error) {
        this.logger.error(`No se pudo purgar la cuenta ${user.id}: ${(error as Error).message}`);
      }
    }
  }
}
