import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PatientsService } from './patients.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

// Sin @Roles(): cualquier usuario autenticado (USER, PROFESSIONAL, ADMIN...)
// puede tener su propia ficha de paciente — un médico también puede agendar
// consigo mismo como paciente de otro colega.
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.patients.getOwnProfile(user.id);
  }

  @Patch('me')
  updateOwnProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePatientProfileDto) {
    return this.patients.updateOwnProfile(user.id, dto);
  }
}
