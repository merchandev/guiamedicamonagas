import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PatientsModule } from '../patients/patients.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { AccountManagementService } from './account-management.service';
import { AccountPurgeService } from './account-purge.service';
import { PatientAccountsController, ProfessionalAccountsController } from './account-management.controller';

@Module({
  imports: [PatientsModule, StorageModule, NotificationsModule, MailModule],
  controllers: [AdminController, PatientAccountsController, ProfessionalAccountsController],
  providers: [AdminService, AccountManagementService, AccountPurgeService],
})
export class AdminModule {}
