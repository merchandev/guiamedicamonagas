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
import { PatientPrivacyController } from './patient-privacy.controller';
import { PatientPrivacyService } from './patient-privacy.service';
import { LegalModule } from '../legal/legal.module';

@Module({
  imports: [StorageModule, NotificationsModule, LegalModule],
  controllers: [PatientsController, PatientPrivacyController, PatientIdentityAdminController, PatientVaultController],
  providers: [PatientsService, PatientPrivacyService, PatientDataCodec, LegacyPatientDataMigrator, PatientVaultService, PatientVaultGuard],
  exports: [PatientsService, PatientDataCodec, PatientVaultGuard, PatientVaultService],
})
export class PatientsModule {}
