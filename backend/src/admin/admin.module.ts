import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PatientsModule } from '../patients/patients.module';
import { AccountManagementService } from './account-management.service';
import { PatientAccountsController, ProfessionalAccountsController } from './account-management.controller';

@Module({
  imports: [PatientsModule],
  controllers: [AdminController, PatientAccountsController, ProfessionalAccountsController],
  providers: [AdminService, AccountManagementService],
})
export class AdminModule {}
