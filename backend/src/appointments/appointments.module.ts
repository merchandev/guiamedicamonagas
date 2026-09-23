import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { PatientsModule } from '../patients/patients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentRemindersService } from './appointment-reminders.service';

@Module({
  imports: [AgendaModule, PatientsModule, NotificationsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentRemindersService],
})
export class AppointmentsModule {}
