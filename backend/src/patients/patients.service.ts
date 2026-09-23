import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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
  ) {}

  private async generatePatientCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = `GMM-${randomBytes(2).toString('hex').toUpperCase()}`;
      const exists = await this.prisma.patientProfile.findUnique({ where: { patientCode: code } });
      if (!exists) return code;
    }
    throw new Error('No se pudo generar un código de paciente único');
  }

  /** Paciente logueado: obtiene su ficha, o la crea la primera vez que reserva. */
  async getOrCreateForUser(userId: string, identity?: PatientIdentity) {
    const existing = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (existing) return existing;

    if (!identity?.firstName || !identity?.lastName) {
      throw new BadRequestException('Nombre y apellido son obligatorios para tu primera reserva');
    }

    const patientCode = await this.generatePatientCode();
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
    const patientCode = await this.generatePatientCode();
    return this.prisma.patientProfile.create({
      data: { patientCode, firstName: identity.firstName, lastName: identity.lastName, phone: identity.phone },
    });
  }

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes una ficha de paciente todavía');
    return profile;
  }

  async updateOwnProfile(userId: string, dto: UpdatePatientProfileDto) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes una ficha de paciente todavía');
    return this.prisma.patientProfile.update({
      where: { id: profile.id },
      data: { ...dto, birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined },
    });
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
