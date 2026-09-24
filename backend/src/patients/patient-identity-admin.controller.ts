import { Body, Controller, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common';
import { IdentityStatus } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission, RequirePermissions } from '../common/permissions';
import { PatientsService } from './patients.service';
import { ReviewIdentityDto } from './dto/review-identity.dto';

/**
 * Revisión de la foto de identificación de los pacientes. Separado de
 * PatientsController, que solo opera sobre la ficha del propio usuario.
 */
@RequirePermissions(Permission.VERIFY_PATIENT_IDENTITY)
@Controller('patients/admin/identity')
export class PatientIdentityAdminController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  queue(
    @Query('status', new ParseEnumPipe(IdentityStatus, { optional: true })) status?: IdentityStatus,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ) {
    return this.patients.identityQueue({ status, page });
  }

  @Get(':id')
  case(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.patients.identityCase(id, admin.id, req.ip);
  }

  @Patch(':id/review')
  review(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewIdentityDto,
    @Req() req: FastifyRequest,
  ) {
    return this.patients.reviewIdentity(id, admin.id, dto.approved, dto.note, req.ip);
  }
}
