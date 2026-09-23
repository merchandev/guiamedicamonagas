import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('track')
  // El frontend solo llama aquí si el visitante aceptó cookies de análisis;
  // aun así no se guarda IP ni user-agent: es un conteo anónimo.
  track(@Body() dto: TrackEventDto) {
    return this.analytics.track(dto);
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me')
  statsForOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.statsForOwnProfile(user.id);
  }
}
