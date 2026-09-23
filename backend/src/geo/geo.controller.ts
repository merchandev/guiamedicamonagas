import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { Permission, RequirePermissions } from '../common/permissions';
import { GeoService } from './geo.service';

class NameDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

class ActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('states')
  listStates() {
    return this.geo.listStates();
  }

  @Public()
  @Get('municipalities')
  listMunicipalities(@Query('state') stateSlug?: string) {
    return this.geo.listMunicipalities(stateSlug);
  }

  @Public()
  @Get('municipalities/:id/parishes')
  listParishes(@Param('id') id: string) {
    return this.geo.listParishes(id);
  }

  @RequirePermissions(Permission.MANAGE_CATALOG)
  @Get('admin/states')
  adminListStates() {
    return this.geo.listStates(false);
  }

  @RequirePermissions(Permission.MANAGE_CATALOG)
  @Patch('admin/states/:slug')
  setStateActive(@Param('slug') slug: string, @Body() dto: ActiveDto) {
    return this.geo.setStateActive(slug, dto.isActive);
  }

  @RequirePermissions(Permission.MANAGE_CATALOG)
  @Post('admin/states/:slug/municipalities')
  addMunicipality(@Param('slug') slug: string, @Body() dto: NameDto) {
    return this.geo.addMunicipality(slug, dto.name);
  }

  @RequirePermissions(Permission.MANAGE_CATALOG)
  @Post('admin/municipalities/:id/parishes')
  addParish(@Param('id') id: string, @Body() dto: NameDto) {
    return this.geo.addParish(id, dto.name);
  }
}
