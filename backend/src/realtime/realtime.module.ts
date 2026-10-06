import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { EnvConfig } from '../config/env.validation';
import { RealtimeDispatcher } from './realtime.dispatcher';
import { RealtimeServer } from './realtime.server';

@Module({
  imports: [
    // Solo verifica los tokens de acceso que firma AuthModule (mismo secreto).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({ secret: config.get('JWT_SECRET', { infer: true }) }),
    }),
  ],
  providers: [RealtimeServer, RealtimeDispatcher],
  exports: [RealtimeServer],
})
export class RealtimeModule {}
