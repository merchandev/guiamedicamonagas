import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
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
  AddMemberDto,
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

  // --- Autogestión (cuenta de organización) ---------------------------------

  @Roles(Role.ORGANIZATION)
  @Get('me/list')
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.listOwn(user.id);
  }

  @Roles(Role.ORGANIZATION)
  @Get('me/:id')
  getOwn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizations.getOwn(user.id, id);
  }

  @Roles(Role.ORGANIZATION)
  @Put('me/:id')
  updateOwn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateOwnOrganizationDto) {
    return this.organizations.updateOwn(user.id, id, dto);
  }

  @Roles(Role.ORGANIZATION)
  @Post('me/:id/logo')
  async uploadLogo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: FastifyRequest) {
    const raw = await readSingleUploadedFile(req, MAX_LOGO_SIZE);
    const file = await this.uploads.secure(raw, IMAGE_TYPES);
    const key = this.storage.buildKey('organization-logos', file.extension);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);
    return this.organizations.updateOwnLogo(user.id, id, key);
  }

  @Roles(Role.ORGANIZATION)
  @Get('me/:id/members')
  listMembers(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizations.listMembers(user.id, id);
  }

  @Roles(Role.ORGANIZATION)
  @Post('me/:id/members')
  addMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.organizations.addMember(user.id, id, dto);
  }

  @Roles(Role.ORGANIZATION)
  @Delete('me/:id/members/:memberId')
  removeMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.organizations.removeMember(user.id, id, memberId);
  }

  @Roles(Role.ORGANIZATION)
  @Get('me/:id/professionals/search')
  searchProfessionals(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query('q') q: string) {
    return this.organizations.searchProfessionals(user.id, id, q);
  }

  @Roles(Role.ORGANIZATION)
  @Post('me/:id/professionals')
  inviteProfessional(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: InviteProfessionalDto) {
    return this.organizations.inviteProfessional(user.id, id, dto.professionalId);
  }

  @Roles(Role.ORGANIZATION)
  @Delete('me/:id/professionals/:professionalId')
  removeProfessional(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('professionalId') professionalId: string,
  ) {
    return this.organizations.removeProfessional(user.id, id, professionalId);
  }

  @Roles(Role.ORGANIZATION)
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
