import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission, RequirePermissions } from '../common/permissions';
import { PatientVaultGuard } from '../patients/patient-vault.guard';
import { AccountListDto, ModerateAccountDto } from './account-management.dto';
import { AccountManagementService } from './account-management.service';

@RequirePermissions(Permission.MANAGE_ACCOUNTS)
@Controller('admin/accounts/professionals')
export class ProfessionalAccountsController {
  constructor(private readonly accounts: AccountManagementService) {}
  @Get()
  list(@Query() query: AccountListDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.accounts.list('PROFESSIONAL', query, actor.id, req.ip);
  }
  @Patch(':id')
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateAccountDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.accounts.moderate(id, 'PROFESSIONAL', dto, actor.id, req.ip);
  }
}

// La cookie de la bóveda solo se envía bajo /patients/admin.
@RequirePermissions(Permission.MANAGE_ACCOUNTS, Permission.VERIFY_PATIENT_IDENTITY)
@UseGuards(PatientVaultGuard)
@Controller('patients/admin/accounts')
export class PatientAccountsController {
  constructor(private readonly accounts: AccountManagementService) {}
  @Get()
  list(@Query() query: AccountListDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.accounts.list('USER', query, actor.id, req.ip);
  }
  @Patch(':id')
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateAccountDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.accounts.moderate(id, 'USER', dto, actor.id, req.ip);
  }
}
