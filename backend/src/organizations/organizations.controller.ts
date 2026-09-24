import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission, RequirePermissions } from '../common/permissions';
import { readSingleUploadedFile } from '../common/utils/multipart';
import { StorageService } from '../storage/storage.service';
import { IMAGE_TYPES, UploadSecurityService } from '../uploads/upload-security.service';
import { OrganizationsService } from './organizations.service';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';
import {
  AcceptInvitationDto,
  ChangeMemberRoleDto,
  InviteMemberDto,
  InviteProfessionalDto,
  RespondAffiliationDto,
  ReviewOrganizationDto,
  UpdateOwnOrganizationDto,
} from './dto/self-service.dto';

const MAX_LOGO_SIZE = 3 * 1024 * 1024;

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly storage: StorageService,
    private readonly uploads: UploadSecurityService,
  ) {}

  @Public()
  @Get()
  findAll(
    @Query('type') type?: 'PHARMACY' | 'LABORATORY' | 'CLINIC',
    @Query('municipality') municipality?: string,
  ) {
    return this.organizations.findAll(type, municipality);
  }

  // --- Autogestión (miembros del equipo) --------------------------------------
  // Sin @Roles: autoriza la pertenencia a la organización y el rol que se
  // tiene en ella (organization-roles.ts), no el tipo de cuenta.

  @Get('me/list')
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.listOwn(user.id);
  }

  // Invitaciones: vista previa pública del enlace y aceptación con sesión.
  // Van antes de 'me/:id' para no confundirse con un id.

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('invitations/preview')
  previewInvitation(@Query('token') token: string) {
    return this.organizations.previewInvitation(token);
  }

  @HttpCode(HttpStatus.OK)
  @Post('invitations/accept')
  acceptInvitation(@CurrentUser() user: AuthenticatedUser, @Body() dto: AcceptInvitationDto, @Req() req: FastifyRequest) {
    return this.organizations.acceptInvitation(user, dto.token, req.ip);
  }

  @Get('me/:id')
  getOwn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizations.getOwn(user.id, id);
  }

  @Put('me/:id')
  updateOwn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateOwnOrganizationDto) {
    return this.organizations.updateOwn(user.id, id, dto);
  }

  @Post('me/:id/logo')
  async uploadLogo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: FastifyRequest) {
    const raw = await readSingleUploadedFile(req, MAX_LOGO_SIZE);
    const file = await this.uploads.secure(raw, IMAGE_TYPES);
    const key = this.storage.buildKey('organization-logos', file.extension);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);
    return this.organizations.updateOwnLogo(user.id, id, key);
  }

  @Get('me/:id/members')
  listMembers(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizations.listMembers(user.id, id);
  }

  @Patch('me/:id/members/:memberId')
  changeMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: ChangeMemberRoleDto,
    @Req() req: FastifyRequest,
  ) {
    return this.organizations.changeMemberRole(user.id, id, memberId, dto.role, req.ip);
  }

  @Delete('me/:id/members/:memberId')
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Req() req: FastifyRequest,
  ) {
    return this.organizations.removeMember(user.id, id, memberId, req.ip);
  }

  @Get('me/:id/invitations')
  listInvitations(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizations.listInvitations(user.id, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/:id/invitations')
  inviteMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @Req() req: FastifyRequest,
  ) {
    return this.organizations.inviteMember(user.id, id, dto, req.ip);
  }

  @Delete('me/:id/invitations/:invitationId')
  revokeInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Req() req: FastifyRequest,
  ) {
    return this.organizations.revokeInvitation(user.id, id, invitationId, req.ip);
  }

  @Get('me/:id/professionals/search')
  searchProfessionals(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query('q') q: string) {
    return this.organizations.searchProfessionals(user.id, id, q);
  }

  @Post('me/:id/professionals')
  inviteProfessional(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: InviteProfessionalDto) {
    return this.organizations.inviteProfessional(user.id, id, dto.professionalId);
  }

  @Delete('me/:id/professionals/:professionalId')
  removeProfessional(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('professionalId') professionalId: string,
  ) {
    return this.organizations.removeProfessional(user.id, id, professionalId);
  }

  @Get('me/:id/stats')
  stats(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizations.stats(user.id, id);
  }

  // --- Lado del médico -------------------------------------------------------

  @Roles(Role.PROFESSIONAL)
  @Get('affiliations/me')
  listAffiliations(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.listAffiliationsForProfessional(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Patch('affiliations/me/:organizationId')
  respondAffiliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: RespondAffiliationDto,
  ) {
    return this.organizations.respondAffiliation(user.id, organizationId, dto.accept);
  }

  // --- Administración ------------------------------------------------------

  @RequirePermissions(Permission.MANAGE_ORGANIZATIONS)
  @Get('admin/list')
  adminList(@Query('status') status?: string) {
    return this.organizations.adminList(status);
  }

  @RequirePermissions(Permission.MANAGE_ORGANIZATIONS)
  @Patch('admin/:id/review')
  review(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewOrganizationDto,
    @Req() req: FastifyRequest,
  ) {
    return this.organizations.review(id, admin.id, dto.approved, dto.note, req.ip);
  }

  @RequirePermissions(Permission.MANAGE_ORGANIZATIONS)
  @Post()
  create(@Body() dto: UpsertOrganizationDto) {
    return this.organizations.create(dto);
  }

  @RequirePermissions(Permission.MANAGE_ORGANIZATIONS)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertOrganizationDto) {
    return this.organizations.update(id, dto);
  }

  @RequirePermissions(Permission.MANAGE_ORGANIZATIONS)
  @Patch(':id/publish')
  setPublished(@Param('id') id: string, @Body('isPublished') isPublished: boolean) {
    return this.organizations.setPublished(id, isPublished);
  }

  @RequirePermissions(Permission.MANAGE_ORGANIZATIONS)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizations.remove(id);
  }

  @Public()
  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.organizations.findBySlug(slug);
  }
}
