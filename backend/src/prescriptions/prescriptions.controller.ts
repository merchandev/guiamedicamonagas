import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { readSingleUploadedFile } from '../common/utils/multipart';
import { IMAGE_TYPES, UploadSecurityService } from '../uploads/upload-security.service';
import { PrescriptionsService } from './prescriptions.service';
import { PAD_IMAGE_KINDS, PadImageKind } from './pad-images';
import {
  AnnulPrescriptionDto,
  DeliverPrescriptionDto,
  EmailPrescriptionDto,
  IssuePrescriptionDto,
  PrescriptionCodeDto,
  PrescriptionListDto,
  UpdatePrescriptionPadDto,
} from './dto/prescriptions.dto';

const MAX_PAD_IMAGE_SIZE = 5 * 1024 * 1024;

function pdfFile(file: { buffer: Buffer; filename: string }) {
  return new StreamableFile(file.buffer, {
    type: 'application/pdf',
    disposition: `attachment; filename="${file.filename}"`,
    length: file.buffer.length,
  });
}

function padImageKind(kind: string): PadImageKind {
  if (!(PAD_IMAGE_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Imagen del talonario inválida');
  return kind as PadImageKind;
}

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(
    private readonly prescriptions: PrescriptionsService,
    private readonly uploads: UploadSecurityService,
  ) {}

  /** Si los récipes digitales están encendidos (PRESCRIPTIONS_ENABLED). */
  @Public()
  @Get('config')
  config() {
    return this.prescriptions.publicConfig();
  }

  // --- Público: quien tiene el código (paciente o farmacia) ------------------
  // El código va en el cuerpo, no en la URL, para que no quede en registros.

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify')
  verify(@Body() dto: PrescriptionCodeDto) {
    return this.prescriptions.verify(dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Post('verify/pdf')
  async verifyPdf(@Body() dto: PrescriptionCodeDto) {
    return pdfFile(await this.prescriptions.verifyPdf(dto.code));
  }

  // --- Médico: talonario ------------------------------------------------------

  @Roles(Role.PROFESSIONAL)
  @Get('pad')
  getPad(@CurrentUser() user: AuthenticatedUser) {
    return this.prescriptions.getPad(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Patch('pad')
  updatePad(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePrescriptionPadDto, @Req() req: FastifyRequest) {
    return this.prescriptions.updatePad(user.id, dto, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Header('Cache-Control', 'no-store')
  @Get('pad/preview')
  async preview(@CurrentUser() user: AuthenticatedUser) {
    return pdfFile(await this.prescriptions.previewPdf(user.id));
  }

  @Roles(Role.PROFESSIONAL)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('pad/:kind')
  async uploadPadImage(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string, @Req() req: FastifyRequest) {
    const imageKind = padImageKind(kind);
    const raw = await readSingleUploadedFile(req, MAX_PAD_IMAGE_SIZE);
    const file = await this.uploads.secure(raw, IMAGE_TYPES);
    return this.prescriptions.setPadImage(user.id, imageKind, file.buffer, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Delete('pad/:kind')
  removePadImage(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string, @Req() req: FastifyRequest) {
    return this.prescriptions.removePadImage(user.id, padImageKind(kind), req.ip);
  }

  // --- Médico: récipes --------------------------------------------------------

  @Roles(Role.PROFESSIONAL)
  @Get('patients')
  listPatients(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.prescriptions.listPatients(user.id, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PrescriptionListDto) {
    return this.prescriptions.list(user.id, query);
  }

  @Roles(Role.PROFESSIONAL)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  issue(@CurrentUser() user: AuthenticatedUser, @Body() dto: IssuePrescriptionDto, @Req() req: FastifyRequest) {
    return this.prescriptions.issue(user.id, dto, req.ip);
  }

  // --- Paciente: «Mis récipes» -----------------------------------------------
  // Sin @Roles(): como en PatientsController, cualquier cuenta con ficha de
  // paciente; todo opera sobre la ficha propia.

  @Get('me')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.prescriptions.listMine(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('claim')
  claim(@CurrentUser() user: AuthenticatedUser, @Body() dto: PrescriptionCodeDto, @Req() req: FastifyRequest) {
    return this.prescriptions.claim(user.id, dto.code, req.ip);
  }

  @Get('me/:id')
  detailMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prescriptions.detailMine(user.id, id);
  }

  @Header('Cache-Control', 'no-store')
  @Get('me/:id/pdf')
  async pdfMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return pdfFile(await this.prescriptions.pdfMine(user.id, id));
  }

  // --- Médico: un récipe (después de las rutas fijas) -------------------------

  @Roles(Role.PROFESSIONAL)
  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prescriptions.detail(user.id, id);
  }

  @Roles(Role.PROFESSIONAL)
  @Header('Cache-Control', 'no-store')
  @Get(':id/pdf')
  async pdf(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return pdfFile(await this.prescriptions.pdf(user.id, id));
  }

  @Roles(Role.PROFESSIONAL)
  @HttpCode(200)
  @Post(':id/annul')
  annul(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AnnulPrescriptionDto, @Req() req: FastifyRequest) {
    return this.prescriptions.annul(user.id, id, dto, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':id/email')
  email(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: EmailPrescriptionDto, @Req() req: FastifyRequest) {
    return this.prescriptions.email(user.id, id, dto, req.ip);
  }

  @Roles(Role.PROFESSIONAL)
  @HttpCode(200)
  @Post(':id/deliver')
  deliver(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DeliverPrescriptionDto, @Req() req: FastifyRequest) {
    return this.prescriptions.deliver(user.id, id, dto, req.ip);
  }
}
