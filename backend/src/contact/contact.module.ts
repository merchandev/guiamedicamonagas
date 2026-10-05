import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsModule } from '../patients/patients.module';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ContactRequestsService } from './contact-requests.service';

@Module({
  // PatientsModule: el teléfono de la ficha del paciente (cifrado) para precargar el pedido.
  imports: [NotificationsModule, PatientsModule],
  controllers: [ContactController],
  providers: [ContactService, ContactRequestsService],
})
export class ContactModule {}
