import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsModule } from '../patients/patients.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsAdminController } from './reviews-admin.controller';
import { ReviewAuthorAdminController } from './review-author-admin.controller';
import { ReviewsService } from './reviews.service';
import { ReviewModerationService } from './review-moderation.service';
import { SanctionsService } from './sanctions.service';

@Module({
  // PatientsModule: la bóveda de pacientes protege la identidad de los autores.
  imports: [NotificationsModule, PatientsModule],
  controllers: [ReviewsController, ReviewsAdminController, ReviewAuthorAdminController],
  providers: [ReviewsService, ReviewModerationService, SanctionsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
