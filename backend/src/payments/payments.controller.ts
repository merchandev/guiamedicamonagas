import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { readMultipartFormWithFile } from '../common/utils/multipart';
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from '../storage/storage.service';
import { PaymentsService } from './payments.service';
import { ReportPaymentDto } from './dto/report-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('pago-movil-account')
  getPagoMovilAccount() {
    return this.payments.getPagoMovilAccount();
  }

  @Roles(Role.PROFESSIONAL)
  @Post()
  async report(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    const { fields, file } = await readMultipartFormWithFile(
      req,
      ALLOWED_DOCUMENT_MIME_TYPES,
      MAX_DOCUMENT_SIZE_BYTES,
    );
    const dto = plainToInstance(ReportPaymentDto, {
      ...fields,
      amountBs: Number(fields.amountBs),
    });
    try {
      await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true });
    } catch (errors) {
      throw new BadRequestException(errors);
    }
    return this.payments.reportPayment(user.id, dto, file);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('admin/queue')
  adminQueue(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.payments.adminQueue({
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('admin/:id/receipt')
  adminReceiptUrl(@Param('id') id: string) {
    return this.payments.adminReceiptUrl(id);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
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
}
