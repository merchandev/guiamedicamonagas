import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { CookieConsentService } from './cookie-consent.service';
import { RecordConsentDto, UpdateCookieConfigDto } from './dto/cookie-consent.dto';
import { Permission, RequirePermissions } from '../common/permissions';

@Controller('cookie-consent')
export class CookieConsentController {
  constructor(private readonly cookieConsent: CookieConsentService) {}

  @Public()
  @Get('config')
  getConfig() {
    return this.cookieConsent.getConfig();
  }

  @RequirePermissions(Permission.MANAGE_SITE)
  @Put('config')
  updateConfig(@Body() dto: UpdateCookieConfigDto) {
    return this.cookieConsent.updateConfig(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post()
  record(@Body() dto: RecordConsentDto, @Req() req: FastifyRequest) {
    return this.cookieConsent.record(dto, req.ip, req.headers['user-agent']);
  }
}
