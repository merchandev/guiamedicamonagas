import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission, RequirePermissions } from '../common/permissions';
import { NewsletterService } from './newsletter.service';
import {
  AddSubscriberDto,
  CampaignContentDto,
  ImportSubscribersDto,
  ListSubscribersDto,
  PublicSubscribeDto,
  SendTestDto,
  TokenQueryDto,
} from './dto/newsletter.dto';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  // --- Público (formulario de la web, confirmación y baja) -------------------

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('subscribe')
  subscribe(@Body() dto: PublicSubscribeDto) {
    return this.newsletter.publicSubscribe(dto.email, dto.name);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('confirm')
  confirm(@Body() dto: TokenQueryDto) {
    return this.newsletter.confirm(dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('unsubscribe')
  unsubscribe(@Body() dto: TokenQueryDto) {
    return this.newsletter.unsubscribe(dto.token);
  }

  // --- Admin: suscriptores ---------------------------------------------------

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Get('subscribers')
  listSubscribers(@Query() query: ListSubscribersDto) {
    return this.newsletter.listSubscribers(query);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('subscribers')
  addSubscriber(@Body() dto: AddSubscriberDto) {
    return this.newsletter.addSubscriber(dto.email, dto.name);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('subscribers/import')
  importSubscribers(@Body() dto: ImportSubscribersDto) {
    return this.newsletter.importSubscribers(dto.text);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Delete('subscribers/:id')
  removeSubscriber(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsletter.removeSubscriber(id);
  }

  // --- Admin: campañas -------------------------------------------------------

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Get('campaigns')
  listCampaigns() {
    return this.newsletter.listCampaigns();
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('campaigns/preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: CampaignContentDto) {
    return this.newsletter.preview(dto);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('campaigns/estimate')
  @HttpCode(HttpStatus.OK)
  estimate(@Body() dto: CampaignContentDto) {
    return this.newsletter.estimateAudience(dto);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('campaigns/test')
  @HttpCode(HttpStatus.OK)
  test(@Body() dto: SendTestDto) {
    return this.newsletter.sendTest(dto, dto.to);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('campaigns')
  save(@CurrentUser() user: AuthenticatedUser, @Body() dto: CampaignContentDto) {
    return this.newsletter.saveDraft(dto, user.id);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('campaigns/send')
  @HttpCode(HttpStatus.OK)
  send(@CurrentUser() user: AuthenticatedUser, @Body() dto: CampaignContentDto) {
    return this.newsletter.send(dto, user.id);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Get('campaigns/:id')
  getCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsletter.getCampaign(id);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('campaigns/:id/resend-failed')
  @HttpCode(HttpStatus.OK)
  resendFailed(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsletter.resendFailed(id);
  }
}
