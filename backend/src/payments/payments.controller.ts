import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { readMultipartFormWithFile } from '../common/utils/multipart';
import { MAX_DOCUMENT_SIZE_BYTES } from '../storage/storage.service';
import { DOCUMENT_TYPES, UploadSecurityService } from '../uploads/upload-security.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { ReportPaymentDto } from './dto/report-payment.dto';
import { UpsertBankDto } from './dto/upsert-bank.dto';
import { Permission, RequirePermissions } from '../common/permissions';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly uploads: UploadSecurityService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('pago-movil-account')
  getPagoMovilAccount() {
    return this.payments.getPagoMovilAccount();
  }

  @Public()
  @Get('banks')
  listBanks() {
    return this.payments.listBanks();
  }

  // Sin @Roles: lo que autoriza es ser titular de la suscripción (el médico, o
  // dueño/admin de la organización), que el servicio comprueba. El rol global
  // de la cuenta no decide la pertenencia a una organización.
  @Post()
  async report(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    const { fields, file: raw } = await readMultipartFormWithFile(req, MAX_DOCUMENT_SIZE_BYTES);
    const dto = plainToInstance(ReportPaymentDto, {
      ...fields,
      amountBs: Number(fields.amountBs),
    });
    try {
      await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true });
    } catch (errors) {
      throw new BadRequestException(errors);
    }
    const file = await this.uploads.secure(raw, DOCUMENT_TYPES);
    return this.payments.reportPayment(user.id, dto, file);
  }

  @RequirePermissions(Permission.REVIEW_PAYMENTS)
  @Get('admin/queue')
  adminQueue(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.payments.adminQueue({
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @RequirePermissions(Permission.REVIEW_PAYMENTS)
  @Get('admin/:id/receipt')
  adminReceiptUrl(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Req() req: FastifyRequest) {
    return this.payments.adminReceiptUrl(id, admin.id, req.ip);
  }

  @RequirePermissions(Permission.REVIEW_PAYMENTS)
  @Patch('admin/:id/review')
  adminReview(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body('approved') approved: boolean,
    @Body('note') note: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    return this.payments.adminReview(id, admin.id, approved, note, req.ip);
  }

  // --- Catálogo de bancos ------------------------------------------------

  @RequirePermissions(Permission.MANAGE_CATALOG)
  @Get('admin/banks')
  adminListBanks() {
    return this.prisma.financialInstitution.findMany({ orderBy: { code: 'asc' } });
  }

  @RequirePermissions(Permission.MANAGE_CATALOG)
  @Put('admin/banks')
  upsertBank(@Body() dto: UpsertBankDto) {
    return this.prisma.financialInstitution.upsert({
      where: { code: dto.code },
      create: { code: dto.code, name: dto.name, supportsPagoMovil: dto.supportsPagoMovil ?? true, isActive: dto.isActive ?? true },
      update: { name: dto.name, supportsPagoMovil: dto.supportsPagoMovil, isActive: dto.isActive },
    });
  }
}
