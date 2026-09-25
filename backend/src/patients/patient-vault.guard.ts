import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PATIENT_VAULT_COOKIE, PatientVaultService } from './patient-vault.service';

/**
 * Corre después de los guards globales (sesión y permisos): exige además una
 * bóveda abierta por esta cuenta con el código de seguridad.
 */
@Injectable()
export class PatientVaultGuard implements CanActivate {
  constructor(private readonly vault: PatientVaultService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const token = (req.cookies as Record<string, string> | undefined)?.[PATIENT_VAULT_COOKIE];
    const session = req.user ? await this.vault.activeSession(req.user.id, token) : null;
    if (!session) {
      throw new ForbiddenException({
        code: 'PATIENT_VAULT_LOCKED',
        message: 'Los registros de pacientes están protegidos: ingresa el código de seguridad para verlos.',
      });
    }
    return true;
  }
}
