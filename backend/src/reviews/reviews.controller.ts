import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, ReportReviewDto, ReviewPageDto, ReviewReplyDto, UpdateReviewDto } from './dto/reviews.dto';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Si las valoraciones están encendidas (REVIEWS_ENABLED) y desde cuántas se muestra el promedio. */
  @Public()
  @Get('config')
  config() {
    return this.reviews.publicConfig();
  }

  /** Valoraciones publicadas de un médico, sin datos que identifiquen al autor anónimo. */
  @Public()
  @Get('professional/:slug')
  publicList(@Param('slug') slug: string, @Query() query: ReviewPageDto) {
    return this.reviews.publicList(slug, query.page);
  }

  // --- Paciente -------------------------------------------------------------

  @Roles(Role.USER)
  @Get('me')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.reviews.mine(user.id);
  }

  @Roles(Role.USER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReviewDto, @Req() req: FastifyRequest) {
    return this.reviews.create(user.id, dto, req.ip);
  }

  @Roles(Role.USER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
    @Req() req: FastifyRequest,
  ) {
    return this.reviews.update(user.id, id, dto, req.ip);
  }

  @Roles(Role.USER)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.reviews.remove(user.id, id, req.ip);
  }

  // --- Médico ---------------------------------------------------------------

  @Roles(Role.PROFESSIONAL)
  @Get('me/professional')
  forDoctor(@CurrentUser() user: AuthenticatedUser, @Query() query: ReviewPageDto) {
    return this.reviews.forDoctor(user.id, query.page);
  }

  @Roles(Role.PROFESSIONAL)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Put(':id/reply')
  upsertReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReplyDto,
    @Req() req: FastifyRequest,
  ) {
    return this.reviews.upsertReply(user.id, id, dto.content, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Delete(':id/reply')
  removeReply(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.reviews.removeReply(user.id, id, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/report')
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportReviewDto,
    @Req() req: FastifyRequest,
  ) {
    return this.reviews.report(user.id, id, dto, req.ip);
  }
}
