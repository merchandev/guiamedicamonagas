import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { AgendaModule } from './agenda/agenda.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { PostsModule } from './posts/posts.module';
import { DocumentsModule } from './documents/documents.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module';
import { PaymentsModule } from './payments/payments.module';
import { SeoModule } from './seo/seo.module';
import { CookieConsentModule } from './cookie-consent/cookie-consent.module';
import { ContactModule } from './contact/contact.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    StorageModule,
    MailModule,
    WhatsappModule,
    NotificationsModule,
    AuthModule,
    ProfessionalsModule,
    AgendaModule,
    PatientsModule,
    AppointmentsModule,
    PostsModule,
    DocumentsModule,
    SpecialtiesModule,
    OrganizationsModule,
    ExchangeRateModule,
    SubscriptionsModule,
    PaymentsModule,
    SeoModule,
    CookieConsentModule,
    ContactModule,
    AnalyticsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
