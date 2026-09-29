import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission, RequirePermissions } from '../common/permissions';
import { PatientVaultGuard } from '../patients/patient-vault.guard';
import { AccountListDto, ModerateAccountDto, PurgeAccountDto } from './account-management.dto';
import { AccountManagementService } from './account-management.service';
import { PresentationVideoDto } from '../professionals/dto/presentation-video.dto';
import { AccountPurgeService } from './account-purge.service';

@RequirePermissions(Permission.MANAGE_ACCOUNTS)
@Controller('admin/accounts/professionals')
export class ProfessionalAccountsController {
  constructor(
    private readonly accounts: AccountManagementService,
    private readonly purges: AccountPurgeService,
  ) {}
  @Get()
  list(@Query() query: AccountListDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.accounts.list('PROFESSIONAL', query, actor.id, req.ip);
  }
  @Patch(':id')
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateAccountDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.accounts.moderate(id, 'PROFESSIONAL', dto, actor.id, req.ip);
  }
  /** Video de presentación del plan Agencia (lo produce la Guía con el médico). */
  @Put(':id/presentation-video')
  setPresentationVideo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PresentationVideoDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.accounts.setPresentationVideo(id, dto.url, actor.id, req.ip);
  }
  /** Irreversible: solo SUPERADMIN y solo sobre una cuenta ya dada de baja. */
  @RequirePermissions(Permission.MANAGE_ACCOUNTS, Permission.PURGE_ACCOUNTS)
  @Post(':id/purge')
  @HttpCode(200)
  purge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PurgeAccountDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.purges.purge(id, 'PROFESSIONAL', dto.reason, actor.id, req.ip);
  }
}

// La cookie de la bóveda solo se envía bajo /patients/admin.
@RequirePermissions(Permission.MANAGE_ACCOUNTS, Permission.VERIFY_PATIENT_IDENTITY)
@UseGuards(PatientVaultGuard)
@Controller('patients/admin/accounts')
export class PatientAccountsController {
  constructor(
    private readonly accounts: AccountManagementService,
    private readonly purges: AccountPurgeService,
  ) {}
  @Get()
  list(@Query() query: AccountListDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.accounts.list('USER', query, actor.id, req.ip);
  }
  @Patch(':id')
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateAccountDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.accounts.moderate(id, 'USER', dto, actor.id, req.ip);
  }
  @RequirePermissions(Permission.MANAGE_ACCOUNTS, Permission.VERIFY_PATIENT_IDENTITY, Permission.PURGE_ACCOUNTS)
  @Post(':id/purge')
  @HttpCode(200)
  purge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PurgeAccountDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.purges.purge(id, 'USER', dto.reason, actor.id, req.ip);
  }
}
