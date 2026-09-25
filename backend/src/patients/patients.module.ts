import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsController } from './patients.controller';
import { PatientIdentityAdminController } from './patient-identity-admin.controller';
import { PatientsService } from './patients.service';
import { PatientDataCodec } from './patient-data.codec';
import { LegacyPatientDataMigrator } from './legacy-patient-data.migrator';
import { PatientVaultController } from './patient-vault.controller';
import { PatientVaultService } from './patient-vault.service';
import { PatientVaultGuard } from './patient-vault.guard';

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [PatientsController, PatientIdentityAdminController, PatientVaultController],
  providers: [PatientsService, PatientDataCodec, LegacyPatientDataMigrator, PatientVaultService, PatientVaultGuard],
  exports: [PatientsService, PatientDataCodec],
})
export class PatientsModule {}
