import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { AdminPlanAssignmentsService } from './admin-plan-assignments.service';

@Module({
  imports: [NotificationsModule, ExchangeRateModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, AdminPlanAssignmentsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
