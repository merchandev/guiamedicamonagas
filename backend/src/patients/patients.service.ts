import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { generatePatientCode } from './patient-code.util';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

interface PatientIdentity {
  firstName: string;
  lastName: string;
  phone?: string;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Paciente logueado: obtiene su ficha, o la crea la primera vez que reserva. */
  async getOrCreateForUser(userId: string, identity?: PatientIdentity) {
    const existing = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (existing) return existing;

    if (!identity?.firstName || !identity?.lastName) {
      throw new BadRequestException('Nombre y apellido son obligatorios para tu primera reserva');
    }

    const patientCode = await generatePatientCode(this.prisma);
    return this.prisma.patientProfile.create({
      data: {
        userId,
        patientCode,
        firstName: identity.firstName,
        lastName: identity.lastName,
        phone: identity.phone,
      },
    });
  }

  /** Médico registra un paciente sin cuenta (walk-in / agendado por teléfono). */
  async createWalkIn(identity: PatientIdentity) {
    const patientCode = await generatePatientCode(this.prisma);
    return this.prisma.patientProfile.create({
      data: { patientCode, firstName: identity.firstName, lastName: identity.lastName, phone: identity.phone },
    });
  }

  private async signPhotos<T extends { photoKey: string | null; idPhotoKey: string | null }>(
    profile: T,
  ): Promise<T & { photoUrl: string | null; idPhotoUrl: string | null }> {
    const [photoUrl, idPhotoUrl] = await Promise.all([
      profile.photoKey ? this.storage.getSignedDownloadUrl(profile.photoKey, 3600, false).catch(() => null) : null,
      profile.idPhotoKey ? this.storage.getSignedDownloadUrl(profile.idPhotoKey, 3600, false).catch(() => null) : null,
    ]);
    return { ...profile, photoUrl, idPhotoUrl };
  }

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes una ficha de paciente todavía');
    return this.signPhotos(profile);
  }

  async updateOwnProfile(userId: string, dto: UpdatePatientProfileDto) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes una ficha de paciente todavía');

    if (dto.phone && dto.phone !== profile.phone) {
      const existingPhone = await this.prisma.patientProfile.findUnique({ where: { phone: dto.phone } });
      if (existingPhone) {
        throw new ConflictException('Este número de teléfono ya está registrado');
      }
    }

    // El switch "persona sana" bloquea el resumen de condición de verdad, no
    // solo en la UI: si isHealthy queda en true, cualquier texto que venga en
    // el DTO se descarta.
    const isHealthy = dto.isHealthy ?? profile.isHealthy;
    const conditionSummary = isHealthy ? null : (dto.conditionSummary ?? profile.conditionSummary);

    try {
      const updated = await this.prisma.patientProfile.update({
        where: { id: profile.id },
        data: {
          ...dto,
          conditionSummary,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          medications: dto.medications as unknown as Prisma.InputJsonValue | undefined,
          treatingDoctors: dto.treatingDoctors as unknown as Prisma.InputJsonValue | undefined,
        },
      });
      return this.signPhotos(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Estos datos ya están asociados a otra cuenta');
      }
      throw error;
    }
  }

  async updateOwnPhoto(userId: string, key: string) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes una ficha de paciente todavía');
    const previousKey = profile.photoKey;
    const updated = await this.prisma.patientProfile.update({ where: { id: profile.id }, data: { photoKey: key } });
    if (previousKey) await this.storage.deleteObject(previousKey).catch(() => undefined);
    return this.signPhotos(updated);
  }

  async updateOwnIdPhoto(userId: string, key: string) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes una ficha de paciente todavía');
    const previousKey = profile.idPhotoKey;
    const updated = await this.prisma.patientProfile.update({
      where: { id: profile.id },
      data: { idPhotoKey: key, identityStatus: 'PENDING' },
    });
    if (previousKey) await this.storage.deleteObject(previousKey).catch(() => undefined);
    return this.signPhotos(updated);
  }

  /**
   * Lista de pacientes de un profesional: SOLO código de paciente, nunca
   * nombre/teléfono/cédula, y sin ningún parámetro de búsqueda por esos
   * datos — el médico solo encuentra a un paciente si este le da su código.
   */
  async listForProfessional(professionalId: string) {
    const appointments = await this.prisma.appointment.findMany({
      where: { professionalId },
      select: { patientId: true, startsAt: true, patient: { select: { patientCode: true } } },
      orderBy: { startsAt: 'desc' },
    });

    const byPatient = new Map<
      string,
      { patientId: string; patientCode: string; appointmentCount: number; lastVisit: Date }
    >();
    for (const appt of appointments) {
      const existing = byPatient.get(appt.patientId);
      if (existing) {
        existing.appointmentCount += 1;
      } else {
        byPatient.set(appt.patientId, {
          patientId: appt.patientId,
          patientCode: appt.patient.patientCode,
          appointmentCount: 1,
          lastVisit: appt.startsAt,
        });
      }
    }
    return Array.from(byPatient.values()).sort((a, b) => b.lastVisit.getTime() - a.lastVisit.getTime());
  }

  /**
   * Revela nombre/teléfono de un paciente a un médico — solo si tienen al
   * menos una cita en común. Cada revelación queda auditada.
   */
  async revealForProfessional(professionalId: string, patientId: string, requestedByUserId: string) {
    const hasRelationship = await this.prisma.appointment.findFirst({
      where: { professionalId, patientId },
      select: { id: true },
    });
    if (!hasRelationship) {
      throw new ForbiddenException('Este paciente no tiene citas contigo');
    }

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    await this.audit.record({
      userId: requestedByUserId,
      action: 'PATIENT_IDENTITY_REVEALED',
      resource: 'PatientProfile',
      resourceId: patient.id,
    });

    return patient;
  }
}
