import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission, RequirePermissions } from '../common/permissions';
import { PatientVaultGuard } from '../patients/patient-vault.guard';
import { ReviewModerationService } from './review-moderation.service';

/**
 * Quién escribió una valoración: es un registro de paciente, así que exige la
 * bóveda abierta con el código de seguridad (su cookie solo viaja a
 * /patients/admin) además del permiso de moderar. Queda en la auditoría.
 */
@RequirePermissions(Permission.MODERATE_REVIEWS)
@UseGuards(PatientVaultGuard)
@Controller('patients/admin/reviews')
export class ReviewAuthorAdminController {
  constructor(private readonly moderation: ReviewModerationService) {}

  @Get(':id/author')
  author(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.moderation.author(id, admin.id, req.ip);
  }
}
