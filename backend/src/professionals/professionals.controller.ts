import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { readSingleUploadedFile } from '../common/utils/multipart';
import { StorageService } from '../storage/storage.service';
import { ProfessionalsService } from './professionals.service';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';
import { UpsertLocationDto } from './dto/upsert-location.dto';

const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

@Controller('professionals')
export class ProfessionalsController {
  constructor(
    private readonly professionals: ProfessionalsService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get()
  findAll(
    @Query('specialty') specialtySlug?: string,
    @Query('municipality') municipality?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.professionals.findPublicList({
      specialtySlug,
      municipality,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me')
  getOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.professionals.getOwnProfile(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Patch('me')
  updateOwn(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfessionalProfileDto) {
    return this.professionals.updateOwnProfile(user.id, dto);
  }

  @Roles(Role.PROFESSIONAL)
  @Post('me/photo')
  async uploadPhoto(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    const file = await readSingleUploadedFile(req, PHOTO_MIME_TYPES, MAX_PHOTO_SIZE);
    const key = this.storage.buildKey('avatars', file.filename);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);
    return this.professionals.updateOwnPhoto(user.id, key);
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me/locations')
  listOwnLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.professionals.listOwnLocations(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Post('me/locations')
  addOwnLocation(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertLocationDto) {
    return this.professionals.addOwnLocation(user.id, dto);
  }

  @Roles(Role.PROFESSIONAL)
  @Delete('me/locations/:id')
  removeOwnLocation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.professionals.removeOwnLocation(user.id, id);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('admin/list')
  adminFindAll(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.professionals.adminFindAll({
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('admin/:id')
  adminGetOne(@Param('id') id: string) {
    return this.professionals.adminGetOne(id);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Patch('admin/:id/suspend')
  adminSuspend(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body('suspended') suspended: boolean,
    @Body('note') note?: string,
  ) {
    return this.professionals.adminSetSuspended(id, suspended, note, admin.id);
  }

  @Public()
  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.professionals.findPublicBySlug(slug);
  }
}
