import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrganizationsService } from './organizations.service';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Public()
  @Get()
  findAll(
    @Query('type') type?: 'PHARMACY' | 'LABORATORY' | 'CLINIC',
    @Query('municipality') municipality?: string,
  ) {
    return this.organizations.findAll(type, municipality);
  }

  @Public()
  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.organizations.findBySlug(slug);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post()
  create(@Body() dto: UpsertOrganizationDto) {
    return this.organizations.create(dto);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertOrganizationDto) {
    return this.organizations.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Patch(':id/publish')
  setPublished(@Param('id') id: string, @Body('isPublished') isPublished: boolean) {
    return this.organizations.setPublished(id, isPublished);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizations.remove(id);
  }
}
