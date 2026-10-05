import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission, RequirePermissions } from '../common/permissions';
import { ReviewModerationService } from './review-moderation.service';
import { SanctionsService } from './sanctions.service';
import {
  CreateSanctionDto,
  DeleteReviewDto,
  ModerateReplyDto,
  ModerationListDto,
  ModerationReasonDto,
  ResolveReportDto,
  SanctionDurationDto,
  SanctionListDto,
} from './dto/moderation.dto';

/**
 * Moderación de valoraciones, respuestas y denuncias, y sanciones a sus
 * autores. Solo con el permiso MODERATE_REVIEWS (suspender una cuenta exige
 * además MANAGE_ACCOUNTS, ver SanctionsService). Todo queda en la auditoría.
 */
@RequirePermissions(Permission.MODERATE_REVIEWS)
@Controller('reviews/admin')
export class ReviewsAdminController {
  constructor(
    private readonly moderation: ReviewModerationService,
    private readonly sanctions: SanctionsService,
  ) {}

  @Get()
  list(@Query() query: ModerationListDto) {
    return this.moderation.list(query);
  }

  // --- Sanciones -------------------------------------------------------------

  @Get('sanctions')
  listSanctions(@Query() query: SanctionListDto) {
    return this.sanctions.listForUser(query.userId);
  }

  @Post('sanctions')
  createSanction(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateSanctionDto, @Req() req: FastifyRequest) {
    return this.sanctions.create(dto, admin, req.ip);
  }

  @Patch('sanctions/:id')
  changeSanction(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SanctionDurationDto,
    @Req() req: FastifyRequest,
  ) {
    return this.sanctions.change(id, dto, admin, req.ip);
  }

  @Patch('sanctions/:id/lift')
  liftSanction(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationReasonDto,
    @Req() req: FastifyRequest,
  ) {
    return this.sanctions.lift(id, dto.reason, admin, req.ip);
  }

  // --- Denuncias y autores ---------------------------------------------------

  @Patch('reports/:reportId')
  resolveReport(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: ResolveReportDto,
    @Req() req: FastifyRequest,
  ) {
    return this.moderation.resolveReport(reportId, dto, admin.id, req.ip);
  }

  @Post('authors/:patientId/withdraw-all')
  withdrawAllByAuthor(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: ModerationReasonDto,
    @Req() req: FastifyRequest,
  ) {
    return this.moderation.withdrawAllByAuthor(patientId, dto.reason, admin.id, req.ip);
  }

  // --- Una valoración ----------------------------------------------------------

  /** El caso sin la identidad del autor (esa va por la bóveda, ver ReviewAuthorAdminController). */
  @Get(':id')
  case(@Param('id', ParseUUIDPipe) id: string) {
    return this.moderation.case(id);
  }

  @Patch(':id/approve')
  approve(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.moderation.approve(id, admin.id, req.ip);
  }

  @Patch(':id/reject')
  reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationReasonDto,
    @Req() req: FastifyRequest,
  ) {
    return this.moderation.reject(id, dto.reason, admin.id, req.ip);
  }

  @Patch(':id/withdraw')
  withdraw(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationReasonDto,
    @Req() req: FastifyRequest,
  ) {
    return this.moderation.withdraw(id, dto.reason, admin.id, req.ip);
  }

  @Patch(':id/restore')
  restore(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.moderation.restore(id, admin.id, req.ip);
  }

  /** Borrado definitivo: exige escribir ELIMINAR y un motivo. */
  @Post(':id/delete')
  remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteReviewDto,
    @Req() req: FastifyRequest,
  ) {
    return this.moderation.remove(id, dto.reason, admin.id, req.ip);
  }

  @Patch(':id/reply')
  moderateReply(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateReplyDto,
    @Req() req: FastifyRequest,
  ) {
    return this.moderation.moderateReply(id, dto, admin.id, req.ip);
  }
}
