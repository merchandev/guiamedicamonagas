import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { DocumentType, Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { readSingleUploadedFile } from '../common/utils/multipart';
import { DOCUMENT_TYPES, UploadSecurityService } from '../uploads/upload-security.service';
import { DocumentsService } from './documents.service';
import { ReviewDocumentDto } from './dto/review-document.dto';
import {
  DOCUMENT_CATEGORY,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_LABELS,
  RETIRED_DOCUMENT_TYPES,
} from './document-requirements';
import { Permission, RequirePermissions } from '../common/permissions';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly uploads: UploadSecurityService,
  ) {}

  @Roles(Role.PROFESSIONAL)
  @Get('requirements')
  requirements() {
    return Object.values(DocumentType)
      .filter((type) => !RETIRED_DOCUMENT_TYPES.includes(type))
      .map((type) => ({
        type,
        label: DOCUMENT_LABELS[type],
        category: DOCUMENT_CATEGORY[type],
        categoryLabel: DOCUMENT_CATEGORY_LABELS[DOCUMENT_CATEGORY[type]],
      }));
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me')
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.listOwn(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me/:id/download')
  getOwnDownloadUrl(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documents.getOwnDownloadUrl(user.id, id);
  }

  @Roles(Role.PROFESSIONAL)
  @Post()
  async upload(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    const raw = await readSingleUploadedFile(req, DocumentsService.maxSizeBytes);
    const file = await this.uploads.secure(raw, DOCUMENT_TYPES);
    const type = (req.query as Record<string, string>).type as DocumentType;
    const issuedAt = (req.query as Record<string, string>).issuedAt;
    return this.documents.upload(user.id, type, file, raw.filename, issuedAt);
  }

  @RequirePermissions(Permission.VERIFY_PROFESSIONALS)
  @Get('admin/queue')
  adminQueue(
    @Query('status') status?: string,
    @Query('type') type?: DocumentType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.documents.adminQueue({
      status,
      type,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @RequirePermissions(Permission.VERIFY_PROFESSIONALS)
  @Get('admin/:id/download')
  adminDownloadUrl(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Req() req: FastifyRequest) {
    return this.documents.adminDownloadUrl(id, admin.id, req.ip);
  }

  @RequirePermissions(Permission.VERIFY_PROFESSIONALS)
  @Patch('admin/:id/review')
  adminReview(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewDocumentDto,
    @Req() req: FastifyRequest,
  ) {
    return this.documents.adminReview(id, admin.id, dto.approved, dto.note, dto.expiresAt, req.ip);
  }
}
