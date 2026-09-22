import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
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
  track(@Body() dto: TrackEventDto, @Req() req: FastifyRequest) {
    return this.analytics.track(dto, req.ip, req.headers['user-agent']);
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me')
  statsForOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.statsForOwnProfile(user.id);
  }
}
