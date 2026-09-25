import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { readSingleUploadedFile } from '../common/utils/multipart';
import { StorageService } from '../storage/storage.service';
import { IMAGE_TYPES, UploadSecurityService } from '../uploads/upload-security.service';
import { PatientsService } from './patients.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { CreatePatientDataGrantDto, UpdateShareScopesDto } from './dto/patient-data-grant.dto';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

// Sin @Roles(): cualquier usuario autenticado (USER, PROFESSIONAL, ADMIN...)
// puede tener su propia ficha de paciente — un médico también puede agendar
// consigo mismo como paciente de otro colega. Todo opera sobre la ficha del
// propio usuario: nadie lee aquí la ficha de otra persona.
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly storage: StorageService,
    private readonly uploads: UploadSecurityService,
  ) {}

  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.patients.getOwnProfile(user.id);
  }

  @Patch('me')
  updateOwnProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePatientProfileDto) {
    return this.patients.updateOwnProfile(user.id, dto);
  }

  @Post('me/photo')
  async uploadPhoto(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    const raw = await readSingleUploadedFile(req, MAX_PHOTO_SIZE);
    const file = await this.uploads.secure(raw, IMAGE_TYPES);
    const key = this.storage.buildKey('patient-photos', file.extension);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);
    return this.patients.updateOwnPhoto(user.id, key);
  }

  @Post('me/id-photo')
  async uploadIdPhoto(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    const raw = await readSingleUploadedFile(req, MAX_PHOTO_SIZE);
    const file = await this.uploads.secure(raw, IMAGE_TYPES);
    const key = this.storage.buildKey('patient-id-documents', file.extension);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);
    return this.patients.updateOwnIdPhoto(user.id, key);
  }

  // --- Código para compartir con el médico (texto y QR) ---------------------

  @Get('me/share-code')
  getShareCode(@CurrentUser() user: AuthenticatedUser) {
    return this.patients.getShareCode(user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/share-code')
  rotateShareCode(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.patients.rotateShareCode(user.id, req.ip);
  }

  @Patch('me/share-code')
  updateShareScopes(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateShareScopesDto) {
    return this.patients.updateShareScopes(user.id, dto.scopes);
  }

  // --- Consentimientos: quién puede ver mis datos --------------------------

  @Get('me/grants')
  listGrants(@CurrentUser() user: AuthenticatedUser) {
    return this.patients.listOwnGrants(user.id);
  }

  @Get('me/professionals')
  listProfessionals(@CurrentUser() user: AuthenticatedUser) {
    return this.patients.listOwnProfessionals(user.id);
  }

  @Post('me/grants')
  createGrant(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePatientDataGrantDto, @Req() req: FastifyRequest) {
    return this.patients.createGrant(user.id, dto, req.ip);
  }

  @Delete('me/grants/:id')
  revokeGrant(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: FastifyRequest) {
    return this.patients.revokeGrant(user.id, id, req.ip);
  }
}
