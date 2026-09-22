import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

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

  @Roles(Role.PROFESSIONAL)
  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contact.markRead(user.id, id);
  }
}
