import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { ContactRequestsService } from './contact-requests.service';
import { ContactRequestStatusDto, CreateContactRequestDto } from './dto/contact-request.dto';

@Controller('contact')
export class ContactController {
  constructor(
    private readonly contact: ContactService,
    private readonly requests: ContactRequestsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post()
  submit(@Body() dto: CreateContactMessageDto, @Req() req: FastifyRequest) {
    return this.contact.submit(dto, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me')
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.contact.listOwn(user.id);
  }

  // --- «Quiero que me contacte» (paciente con sesión) -----------------------

  @Roles(Role.USER)
  @Get('requests/prefill')
  prefill(@CurrentUser() user: AuthenticatedUser) {
    return this.requests.prefill(user.id);
  }

  @Roles(Role.USER)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('requests')
  createRequest(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContactRequestDto, @Req() req: FastifyRequest) {
    return this.requests.create(user.id, dto, req.ip);
  }

  @Roles(Role.USER)
  @Get('requests/me')
  listMyRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.requests.listMine(user.id);
  }

  @Roles(Role.USER)
  @Patch('requests/:id/withdraw')
  withdrawRequest(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.requests.withdraw(user.id, id, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Patch('requests/:id/status')
  setRequestStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactRequestStatusDto,
    @Req() req: FastifyRequest,
  ) {
    return this.requests.setStatus(user.id, id, dto.status, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contact.markRead(user.id, id);
  }
}
