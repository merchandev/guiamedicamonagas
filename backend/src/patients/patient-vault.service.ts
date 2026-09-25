import { createHash, randomBytes } from 'crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify as argon2Verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { EnvConfig } from '../config/env.validation';

export const PATIENT_VAULT_COOKIE = 'gmm_patient_vault';
/** La cookie solo viaja a las rutas administrativas de pacientes. */
export const PATIENT_VAULT_COOKIE_PATH = '/api/v1/patients/admin';
export const PATIENT_VAULT_TTL_MS = 15 * 60 * 1000;
export const PATIENT_VAULT_MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Acepta el hash Argon2id tal cual o en base64 (la forma recomendada en
 * .env.prod: los `$` del hash no chocan con la interpolación de compose).
 */
export function decodeVaultHash(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (value.startsWith('$argon2')) return value;
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  return decoded.startsWith('$argon2') ? decoded : null;
}

/**
 * «Bóveda» de registros de pacientes para la administración. Ni siquiera un
 * SUPERADMIN ve datos de pacientes solo con su sesión: debe ingresar además
 * el código de seguridad, que abre una ventana de 15 minutos ligada a esa
 * cuenta y a ese navegador (cookie httpOnly; en la BD, solo el hash del
 * token). Cada apertura, cierre e intento fallido queda en la auditoría, y
 * 5 fallos en 15 minutos bloquean a esa cuenta durante la ventana.
 */
@Injectable()
export class PatientVaultService {
  private readonly logger = new Logger(PatientVaultService.name);
  private readonly codeHash: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.codeHash = decodeVaultHash(config.get('PATIENT_VAULT_CODE_HASH', { infer: true }));
    if (!this.codeHash) {
      this.logger.warn('PATIENT_VAULT_CODE_HASH no está configurado: los registros de pacientes quedan cerrados para la administración');
    }
  }

  get configured() {
    return !!this.codeHash;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async unlock(userId: string, code: string, ipAddress?: string) {
    if (!this.codeHash) throw new ServiceUnavailableException('El acceso a registros de pacientes no está configurado');

    const failures = await this.prisma.auditLog.count({
      where: { userId, action: 'PATIENT_VAULT_UNLOCK_FAILED', createdAt: { gt: new Date(Date.now() - FAILURE_WINDOW_MS) } },
    });
    if (failures >= PATIENT_VAULT_MAX_FAILURES) {
      throw new HttpException('Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const valid = await argon2Verify(this.codeHash, code).catch(() => false);
    if (!valid) {
      await this.audit.record({ userId, action: 'PATIENT_VAULT_UNLOCK_FAILED', resource: 'PatientVault', ipAddress });
      throw new ForbiddenException({ code: 'PATIENT_VAULT_BAD_CODE', message: 'Código de seguridad incorrecto' });
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + PATIENT_VAULT_TTL_MS);
    const session = await this.prisma.patientVaultSession.create({
      data: { userId, tokenHash: this.hashToken(token), expiresAt, ipAddress },
    });
    await this.audit.record({
      userId,
      action: 'PATIENT_VAULT_UNLOCKED',
      resource: 'PatientVaultSession',
      resourceId: session.id,
      details: { expiresAt },
      ipAddress,
    });
    return { token, expiresAt };
  }

  /** Sesión vigente de ESTA cuenta con ESTE token, o null. */
  async activeSession(userId: string, token: string | undefined) {
    if (!token) return null;
    const session = await this.prisma.patientVaultSession.findUnique({ where: { tokenHash: this.hashToken(token) } });
    if (!session || session.userId !== userId || session.closedAt || session.expiresAt <= new Date()) return null;
    return session;
  }

  async lock(userId: string, token: string | undefined, ipAddress?: string) {
    const session = await this.activeSession(userId, token);
    if (!session) return;
    await this.prisma.patientVaultSession.update({ where: { id: session.id }, data: { closedAt: new Date() } });
    await this.audit.record({
      userId,
      action: 'PATIENT_VAULT_LOCKED',
      resource: 'PatientVaultSession',
      resourceId: session.id,
      ipAddress,
    });
  }
}
