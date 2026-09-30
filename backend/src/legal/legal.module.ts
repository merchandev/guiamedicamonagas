import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LegalAcceptanceService } from './legal-acceptance.service';
import { LegalRequestsController } from './legal-requests.controller';
import { LegalRequestsService } from './legal-requests.service';

@Module({
  imports: [MailModule, NotificationsModule],
  controllers: [LegalRequestsController],
  providers: [LegalAcceptanceService, LegalRequestsService],
  exports: [LegalAcceptanceService],
})
export class LegalModule {}
