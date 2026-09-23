import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { PatientDataCodec } from './patient-data.codec';
import { LegacyPatientDataMigrator } from './legacy-patient-data.migrator';

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientDataCodec, LegacyPatientDataMigrator],
  exports: [PatientsService, PatientDataCodec],
})
export class PatientsModule {}
