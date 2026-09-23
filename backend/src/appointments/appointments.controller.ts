import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { PatientDataScope, Role } from '@prisma/client';
import { ArrayMinSize, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CreateManualAppointmentDto } from './dto/create-manual-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';

class RequestPatientAccessDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(PatientDataScope, { each: true })
  scopes!: PatientDataScope[];
}

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Public()
  @Get('availability')
  getAvailability(
    @Query('professionalId') professionalId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.appointments.getAvailability(professionalId, from, to);
  }

  // Sin @Roles(): cualquier usuario autenticado puede reservar como paciente.
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(user.id, dto);
  }

  @Get('me')
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.appointments.listOwn(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Post('me/manual')
  createManual(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManualAppointmentDto) {
    return this.appointments.createManual(user.id, dto);
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me/agenda')
  listOwnAgenda(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.appointments.listOwnAgenda(user.id, from, to, status);
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me/patients')
  listPatients(@CurrentUser() user: AuthenticatedUser) {
    return this.appointments.listPatients(user.id);
  }

  /** Solo con consentimiento vigente del paciente (o ficha walk-in propia); cada lectura se audita. */
  @Roles(Role.PROFESSIONAL)
  @Post('me/patients/:patientId/data')
  readPatient(@CurrentUser() user: AuthenticatedUser, @Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.appointments.readPatient(user.id, patientId, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Post('me/patients/:patientId/access-request')
  requestPatientAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Body() dto: RequestPatientAccessDto,
  ) {
    return this.appointments.requestPatientAccess(user.id, patientId, dto.scopes);
  }

  @Roles(Role.PROFESSIONAL)
  @Patch('me/:id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.confirm(user.id, id);
  }

  @Roles(Role.PROFESSIONAL)
  @Patch('me/:id/complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.complete(user.id, id);
  }

  @Roles(Role.PROFESSIONAL)
  @Patch('me/:id/no-show')
  noShow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.noShow(user.id, id);
  }

  // Sin @Roles(): tanto el paciente como el profesional pueden cancelar/reprogramar
  // (el servicio verifica cuál de los dos es el dueño de la cita).
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelAppointmentDto) {
    return this.appointments.cancel(user.id, id, dto);
  }

  @Patch(':id/reschedule')
  reschedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RescheduleAppointmentDto) {
    return this.appointments.reschedule(user.id, id, dto);
  }
}
