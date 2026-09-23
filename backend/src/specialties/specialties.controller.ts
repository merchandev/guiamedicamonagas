import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { SpecialtiesService } from './specialties.service';
import { UpsertSpecialtyDto } from './dto/upsert-specialty.dto';
import { Permission, RequirePermissions } from '../common/permissions';

@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialties: SpecialtiesService) {}

  @Public()
  @Get()
  findAll() {
    return this.specialties.findAll();
  }

  @Public()
  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.specialties.findBySlug(slug);
  }

  @RequirePermissions(Permission.MANAGE_CATALOG)
  @Post()
  create(@Body() dto: UpsertSpecialtyDto) {
    return this.specialties.create(dto);
  }

  @RequirePermissions(Permission.MANAGE_CATALOG)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertSpecialtyDto) {
    return this.specialties.update(id, dto);
  }

  @RequirePermissions(Permission.MANAGE_CATALOG)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.specialties.remove(id);
  }
}
