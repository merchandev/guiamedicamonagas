import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
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
  SaveTemplateDto,
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

  // --- Público: seguimiento de apertura y clic -------------------------------

  @Public()
  @SkipThrottle()
  @Get('t/o/:id')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Content-Type', 'image/gif')
  async trackOpen(@Param('id') id: string, @Res() reply: FastifyReply) {
    const pixel = await this.newsletter.recordOpen(id);
    reply.send(pixel);
  }

  @Public()
  @SkipThrottle()
  @Get('t/c/:id')
  async trackClick(@Param('id') id: string, @Query('u') u: string, @Res() reply: FastifyReply) {
    const target = await this.newsletter.recordClick(id, u ?? '');
    reply.header('Location', target).status(HttpStatus.FOUND).send();
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

  // --- Admin: plantillas -----------------------------------------------------

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Get('templates')
  listTemplates() {
    return this.newsletter.listTemplates();
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('templates')
  saveTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveTemplateDto) {
    return this.newsletter.saveTemplate(dto, user.id);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Get('templates/:id')
  getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsletter.getTemplate(id);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Delete('templates/:id')
  deleteTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsletter.deleteTemplate(id);
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

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('campaigns/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsletter.cancelSchedule(id);
  }

  @RequirePermissions(Permission.MANAGE_NEWSLETTER)
  @Post('campaigns/:id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.newsletter.duplicateCampaign(id, user.id);
  }
}
