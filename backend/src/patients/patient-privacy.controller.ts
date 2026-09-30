import { Controller, Get, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PatientPrivacyService } from './patient-privacy.service';

/** Centro de privacidad del paciente: historial de accesos y copia de sus datos. */
@Controller('patients/me')
export class PatientPrivacyController {
  constructor(private readonly privacy: PatientPrivacyService) {}

  @Get('access-log')
  accessLog(@CurrentUser() user: AuthenticatedUser) {
    return this.privacy.accessLog(user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Get('export')
  exportData(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.privacy.exportData(user.id, req.ip);
  }
}
