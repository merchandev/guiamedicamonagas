import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission, RequirePermissions } from '../common/permissions';
import { CreateLegalRequestDto, ListLegalRequestsDto, LookupLegalRequestDto, UpdateLegalRequestDto } from './legal-request.dto';
import { LegalRequestsService } from './legal-requests.service';

@Controller('legal-requests')
export class LegalRequestsController {
  constructor(private readonly requests: LegalRequestsService) {}

  /** Sin sesión: cualquiera puede reclamar o denunciar (con su correo). */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @Post()
  create(@Body() dto: CreateLegalRequestDto, @Req() req: FastifyRequest) {
    return this.requests.create(dto, req.ip);
  }

  /** Con sesión: queda a nombre de la cuenta (derechos sobre los datos, cierre de cuenta). */
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('me')
  createOwn(@Body() dto: CreateLegalRequestDto, @CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.requests.create(dto, req.ip, user.id);
  }

  @Get('me')
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.requests.listOwn(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('lookup')
  lookup(@Body() dto: LookupLegalRequestDto) {
    return this.requests.lookup(dto);
  }

  @RequirePermissions(Permission.MANAGE_LEGAL_REQUESTS)
  @Get('admin')
  list(@Query() query: ListLegalRequestsDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.requests.list(query, actor.id, req.ip);
  }

  @RequirePermissions(Permission.MANAGE_LEGAL_REQUESTS)
  @Patch('admin/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLegalRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.requests.update(id, dto, actor.id, req.ip);
  }
}
