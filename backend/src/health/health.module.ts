import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [StorageModule, MailModule],
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}
