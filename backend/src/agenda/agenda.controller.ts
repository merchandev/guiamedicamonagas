import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AgendaService } from './agenda.service';
import { UpsertScheduleDto } from './dto/upsert-schedule.dto';
import { UpsertScheduleBlockDto } from './dto/upsert-schedule-block.dto';
import { UpsertScheduleExceptionDto } from './dto/upsert-schedule-exception.dto';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Roles(Role.PROFESSIONAL)
  @Get('me')
  getOwnSchedule(@CurrentUser() user: AuthenticatedUser) {
    return this.agenda.getOwnSchedule(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Put('me')
  updateOwnSchedule(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertScheduleDto) {
    return this.agenda.updateOwnSchedule(user.id, dto);
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me/blocks')
  listOwnBlocks(@CurrentUser() user: AuthenticatedUser) {
    return this.agenda.listOwnBlocks(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Post('me/blocks')
  addOwnBlock(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertScheduleBlockDto) {
    return this.agenda.addOwnBlock(user.id, dto);
  }

  @Roles(Role.PROFESSIONAL)
  @Delete('me/blocks/:id')
  removeOwnBlock(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.agenda.removeOwnBlock(user.id, id);
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me/exceptions')
  listOwnExceptions(@CurrentUser() user: AuthenticatedUser) {
    return this.agenda.listOwnExceptions(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Post('me/exceptions')
  addOwnException(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertScheduleExceptionDto) {
    return this.agenda.addOwnException(user.id, dto);
  }

  @Roles(Role.PROFESSIONAL)
  @Delete('me/exceptions/:id')
  removeOwnException(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.agenda.removeOwnException(user.id, id);
  }
}
