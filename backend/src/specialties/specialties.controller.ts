import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { SpecialtiesService } from './specialties.service';
import { UpsertSpecialtyDto } from './dto/upsert-specialty.dto';

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

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post()
  create(@Body() dto: UpsertSpecialtyDto) {
    return this.specialties.create(dto);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertSpecialtyDto) {
    return this.specialties.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.specialties.remove(id);
  }
}
