import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsModule } from '../patients/patients.module';
import { StorageModule } from '../storage/storage.module';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionCodec } from './prescription.codec';

@Module({
  // PatientsModule: directorio del médico y hash de la cédula de los pacientes.
  imports: [StorageModule, MailModule, NotificationsModule, PatientsModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrescriptionCodec],
})
export class PrescriptionsModule {}
