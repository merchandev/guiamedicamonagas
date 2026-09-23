import { Controller, Get, Body, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { readSingleUploadedFile } from '../common/utils/multipart';
import { StorageService } from '../storage/storage.service';
import { PatientsService } from './patients.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

// Sin @Roles(): cualquier usuario autenticado (USER, PROFESSIONAL, ADMIN...)
// puede tener su propia ficha de paciente — un médico también puede agendar
// consigo mismo como paciente de otro colega.
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly storage: StorageService,
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
    const file = await readSingleUploadedFile(req, PHOTO_MIME_TYPES, MAX_PHOTO_SIZE);
    const key = this.storage.buildKey('patient-photos', file.filename);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);
    return this.patients.updateOwnPhoto(user.id, key);
  }

  @Post('me/id-photo')
  async uploadIdPhoto(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    const file = await readSingleUploadedFile(req, PHOTO_MIME_TYPES, MAX_PHOTO_SIZE);
    const key = this.storage.buildKey('patient-id-documents', file.filename);
    await this.storage.uploadPrivateObject(key, file.buffer, file.mimetype);
    return this.patients.updateOwnIdPhoto(user.id, key);
  }
}
