import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityStatus, PatientDataScope, PatientProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PATIENT_CONSENT_VERSION } from '../common/legal-versions';
import { identityReviewedTemplate, patientDataAccessRequestedTemplate } from '../mail/mail.templates';
import { generatePatientCode } from './patient-code.util';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { CreatePatientDataGrantDto, DEFAULT_GRANT_DAYS } from './dto/patient-data-grant.dto';
import { DecodedPatient, PatientDataCodec, PatientHealthData } from './patient-data.codec';

interface PatientIdentity {
  firstName: string;
  lastName: string;
  phone?: string;
}

const SCOPE_LABELS: Record<PatientDataScope, string> = {
  IDENTITY: 'nombre',
  CONTACT: 'teléfono y contactos de emergencia',
  HEALTH: 'datos de salud',
};

const ACCESS_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly codec: PatientDataCodec,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Creación ---------------------------------------------------------

  /** Paciente logueado: obtiene su ficha, o la crea la primera vez que reserva. */
  async getOrCreateForUser(userId: string, identity?: PatientIdentity) {
    const existing = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (existing) return existing;

    if (!identity?.firstName || !identity?.lastName) {
      throw new BadRequestException('Nombre y apellido son obligatorios para tu primera reserva');
    }

    const patientCode = await generatePatientCode(this.prisma);
    try {
      return await this.prisma.patientProfile.create({
        data: {
          userId,
          patientCode,
          firstName: identity.firstName.trim(),
          lastName: identity.lastName.trim(),
          ...this.codec.encodePhone(identity.phone),
        },
      });
    } catch (error) {
      throw this.translateUniqueError(error);
    }
  }

  /** Médico registra un paciente sin cuenta (walk-in / agendado por teléfono). */
  async createWalkIn(identity: PatientIdentity, professionalId: string) {
    const patientCode = await generatePatientCode(this.prisma);
    return this.prisma.patientProfile.create({
      data: {
        patientCode,
        firstName: identity.firstName.trim(),
        lastName: identity.lastName.trim(),
        createdByProfessionalId: professionalId,
        ...this.codec.encodePhone(identity.phone, false),
      },
    });
  }

  // --- Ficha propia -------------------------------------------------------

  private async ownProfileOrThrow(userId: string) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes una ficha de paciente todavía');
    return profile;
  }

  private async present(profile: PatientProfile) {
    const decoded = this.codec.decode(profile);
    const [photoUrl, idPhotoUrl] = await Promise.all([
      profile.photoKey ? this.storage.getSignedDownloadUrl(profile.photoKey, 3600, false).catch(() => null) : null,
      profile.idPhotoKey ? this.storage.getSignedDownloadUrl(profile.idPhotoKey, 3600, false).catch(() => null) : null,
    ]);
    const { photoKey: _p, idPhotoKey, createdByProfessionalId: _c, identityReviewedById: _r, ...rest } = decoded;
    return { ...rest, hasIdPhoto: !!idPhotoKey, photoUrl, idPhotoUrl };
  }

  async getOwnProfile(userId: string) {
    return this.present(await this.ownProfileOrThrow(userId));
  }

  async updateOwnProfile(userId: string, dto: UpdatePatientProfileDto) {
    const profile = await this.ownProfileOrThrow(userId);
    const current = this.codec.decode(profile);

    const data: Prisma.PatientProfileUpdateInput = {};

    if (dto.cedula) {
      if (current.cedula) {
        throw new BadRequestException('Tu cédula ya está registrada; para corregirla contacta a soporte');
      }
      Object.assign(data, this.codec.encodeCedula(dto.cedula));
    }

    if (dto.phone !== undefined && dto.phone !== current.phone) {
      Object.assign(data, this.codec.encodePhone(dto.phone || null));
    }

    if (dto.municipality !== undefined) data.municipality = dto.municipality || null;

    // El switch "persona sana" bloquea el resumen de condición de verdad, no
    // solo en la UI: si isHealthy queda en true, se descarta cualquier texto.
    const isHealthy = dto.isHealthy ?? current.isHealthy;
    const health: PatientHealthData = {
      birthDate: dto.birthDate ?? current.birthDate,
      sex: dto.sex ?? current.sex,
      bloodType: dto.bloodType ?? current.bloodType,
      allergies: dto.allergies ?? current.allergies,
      emergencyAddress: dto.emergencyAddress ?? current.emergencyAddress,
      emergencyMedicalPhone: dto.emergencyMedicalPhone ?? current.emergencyMedicalPhone,
      isHealthy,
      conditionSummary: isHealthy ? null : (dto.conditionSummary ?? current.conditionSummary),
      medications: dto.medications ?? current.medications,
      treatingDoctors: dto.treatingDoctors ?? current.treatingDoctors,
    };
    data.healthDataEnc = this.codec.encodeHealth(health);

    try {
      const updated = await this.prisma.patientProfile.update({ where: { id: profile.id }, data });
      return this.present(updated);
    } catch (error) {
      throw this.translateUniqueError(error);
    }
  }

  async updateOwnPhoto(userId: string, key: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const updated = await this.prisma.patientProfile.update({ where: { id: profile.id }, data: { photoKey: key } });
    if (profile.photoKey) await this.storage.deleteObject(profile.photoKey).catch(() => undefined);
    return this.present(updated);
  }

  async updateOwnIdPhoto(userId: string, key: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const updated = await this.prisma.patientProfile.update({
      where: { id: profile.id },
      data: { idPhotoKey: key, identityStatus: 'PENDING', identityReviewNote: null, identityReviewedAt: null },
    });
    if (profile.idPhotoKey) await this.storage.deleteObject(profile.idPhotoKey).catch(() => undefined);
    return this.present(updated);
  }

  // --- Verificación de identidad (administración) --------------------------

  /**
   * Cola de revisión: solo código, nombre y fechas. La cédula y la foto se
   * ven al abrir cada caso, y esa lectura queda auditada.
   */
  async identityQueue(params: { status?: IdentityStatus; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const status = params.status ?? 'PENDING';
    // PENDING también cubre fichas que nunca subieron foto: esas no son parte de la cola.
    const where: Prisma.PatientProfileWhereInput = {
      userId: { not: null },
      identityStatus: status,
      ...(status === 'PENDING' ? { idPhotoKey: { not: null } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientProfile.findMany({
        where,
        select: {
          id: true,
          patientCode: true,
          firstName: true,
          lastName: true,
          identityStatus: true,
          identityReviewNote: true,
          identityReviewedAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: status === 'PENDING' ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.patientProfile.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async identityCase(patientId: string, adminId: string, ipAddress?: string) {
    const patient = await this.prisma.patientProfile.findUnique({ where: { id: patientId } });
    if (!patient?.userId) throw new NotFoundException('Paciente no encontrado');
    const decoded = this.codec.decode(patient);
    // URL de 5 minutos: suficiente para revisar, inútil si se filtra después.
    const idPhotoUrl = patient.idPhotoKey
      ? await this.storage.getSignedDownloadUrl(patient.idPhotoKey, 300, false).catch(() => null)
      : null;

    await this.audit.record({
      userId: adminId,
      action: 'PATIENT_IDENTITY_DOCUMENT_VIEWED',
      resource: 'PatientProfile',
      resourceId: patient.id,
      ipAddress,
    });

    return {
      id: patient.id,
      patientCode: patient.patientCode,
      firstName: patient.firstName,
      lastName: patient.lastName,
      cedula: decoded.cedula,
      identityStatus: patient.identityStatus,
      identityReviewNote: patient.identityReviewNote,
      identityReviewedAt: patient.identityReviewedAt,
      createdAt: patient.createdAt,
      idPhotoUrl,
    };
  }

  /**
   * Aprueba o rechaza la foto de identificación. Al rechazar se borra el
   * archivo: no se conserva un documento de identidad que no sirvió.
   */
  async reviewIdentity(patientId: string, adminId: string, approved: boolean, note: string | undefined, ipAddress?: string) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: { user: { select: { email: true } } },
    });
    if (!patient?.userId || !patient.user) throw new NotFoundException('Paciente no encontrado');
    if (!patient.idPhotoKey) throw new BadRequestException('Este paciente no tiene una foto de identificación para revisar');
    if (!approved && !note?.trim()) throw new BadRequestException('Indica el motivo del rechazo');

    const updated = await this.prisma.patientProfile.update({
      where: { id: patient.id },
      data: {
        identityStatus: approved ? 'VERIFIED' : 'REJECTED',
        identityReviewNote: note?.trim() || null,
        identityReviewedAt: new Date(),
        identityReviewedById: adminId,
        ...(approved ? {} : { idPhotoKey: null }),
      },
    });
    if (!approved) await this.storage.deleteObject(patient.idPhotoKey).catch(() => undefined);

    await this.audit.record({
      userId: adminId,
      action: approved ? 'PATIENT_IDENTITY_VERIFIED' : 'PATIENT_IDENTITY_REJECTED',
      resource: 'PatientProfile',
      resourceId: patient.id,
      details: note ? { note } : undefined,
      ipAddress,
    });

    await this.notifications.notify({
      userId: patient.userId,
      type: approved ? 'PATIENT_IDENTITY_VERIFIED' : 'PATIENT_IDENTITY_REJECTED',
      title: approved ? 'Identidad verificada' : 'No pudimos verificar tu identidad',
      content: approved
        ? 'Tu ficha de paciente quedó verificada.'
        : `Sube una nueva foto de tu cédula desde tu perfil.${note ? ` Nota: ${note}` : ''}`,
      email: {
        to: patient.user.email,
        subject: approved ? 'Identidad verificada — Guía Médica Monagas' : 'Revisa tu foto de identificación — Guía Médica Monagas',
        template: approved ? 'patient_identity_verified' : 'patient_identity_rejected',
        html: identityReviewedTemplate(patient.firstName ?? 'Paciente', approved, note, `${FRONTEND_URL}/paciente`),
      },
    });

    return { id: updated.id, identityStatus: updated.identityStatus, identityReviewNote: updated.identityReviewNote };
  }

  // --- Consentimientos (paciente) ----------------------------------------

  async listOwnGrants(userId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    return this.prisma.patientDataGrant.findMany({
      where: { patientId: profile.id },
      include: { professional: { select: { id: true, slug: true, firstName: true, lastName: true } } },
      orderBy: { grantedAt: 'desc' },
    });
  }

  /** Médicos con los que el paciente tiene o tuvo citas: candidatos a recibir acceso. */
  async listOwnProfessionals(userId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const rows = await this.prisma.appointment.findMany({
      where: { patientId: profile.id },
      distinct: ['professionalId'],
      select: { professional: { select: { id: true, slug: true, firstName: true, lastName: true } } },
    });
    return rows.map((r) => r.professional);
  }

  async createGrant(userId: string, dto: CreatePatientDataGrantDto, ipAddress?: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: dto.professionalId },
      select: { id: true, userId: true, verificationStatus: true, firstName: true },
    });
    if (!professional || professional.verificationStatus !== 'VERIFIED') {
      throw new NotFoundException('Profesional no encontrado');
    }

    const days = dto.durationDays ?? DEFAULT_GRANT_DAYS;
    const now = new Date();

    // Un solo consentimiento vigente por médico: el nuevo reemplaza al anterior.
    const grant = await this.prisma.$transaction(async (tx) => {
      await tx.patientDataGrant.updateMany({
        where: { patientId: profile.id, professionalId: professional.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      return tx.patientDataGrant.create({
        data: {
          patientId: profile.id,
          professionalId: professional.id,
          scopes: dto.scopes,
          reason: dto.reason,
          expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
          grantedById: userId,
          consentVersion: PATIENT_CONSENT_VERSION,
        },
      });
    });

    await this.audit.record({
      userId,
      action: 'PATIENT_DATA_GRANTED',
      resource: 'PatientDataGrant',
      resourceId: grant.id,
      details: { professionalId: professional.id, scopes: dto.scopes, days, consentVersion: PATIENT_CONSENT_VERSION },
      ipAddress,
    });

    await this.notifications.notify({
      userId: professional.userId,
      type: 'PATIENT_DATA_GRANTED',
      title: 'Un paciente te dio acceso a sus datos',
      content: `Paciente ${profile.patientCode}: ${dto.scopes.map((s) => SCOPE_LABELS[s]).join(', ')} por ${days} días.`,
    });

    return grant;
  }

  async revokeGrant(userId: string, grantId: string, ipAddress?: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const grant = await this.prisma.patientDataGrant.findUnique({ where: { id: grantId } });
    if (!grant || grant.patientId !== profile.id) throw new NotFoundException('Autorización no encontrada');
    if (grant.revokedAt) return grant;

    const revoked = await this.prisma.patientDataGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } });
    await this.audit.record({
      userId,
      action: 'PATIENT_DATA_REVOKED',
      resource: 'PatientDataGrant',
      resourceId: grantId,
      details: { professionalId: grant.professionalId },
      ipAddress,
    });
    return revoked;
  }

  // --- Vista del médico ----------------------------------------------------

  private async activeGrant(patientId: string, professionalId: string) {
    return this.prisma.patientDataGrant.findFirst({
      where: { patientId, professionalId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { grantedAt: 'desc' },
    });
  }

  /**
   * Lista de pacientes de un profesional: SOLO código de paciente y el
   * estado del consentimiento — nunca nombre/teléfono/cédula, y sin ningún
   * parámetro de búsqueda por esos datos.
   */
  async listForProfessional(professionalId: string) {
    const appointments = await this.prisma.appointment.findMany({
      where: { professionalId },
      select: {
        patientId: true,
        startsAt: true,
        patient: { select: { patientCode: true, userId: true, createdByProfessionalId: true } },
      },
      orderBy: { startsAt: 'desc' },
    });

    const byPatient = new Map<
      string,
      { patientId: string; patientCode: string; appointmentCount: number; lastVisit: Date; hasAccount: boolean; createdByMe: boolean }
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
          hasAccount: !!appt.patient.userId,
          createdByMe: appt.patient.createdByProfessionalId === professionalId,
        });
      }
    }

    const patientIds = [...byPatient.keys()];
    const grants = await this.prisma.patientDataGrant.findMany({
      where: { professionalId, patientId: { in: patientIds }, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { patientId: true, scopes: true, expiresAt: true },
    });
    const grantByPatient = new Map(grants.map((g) => [g.patientId, g]));

    return [...byPatient.values()]
      .sort((a, b) => b.lastVisit.getTime() - a.lastVisit.getTime())
      .map((p) => {
        const grant = grantByPatient.get(p.patientId);
        return {
          ...p,
          access: p.createdByMe
            ? { kind: 'WALK_IN' as const, scopes: ['IDENTITY', 'CONTACT'] as PatientDataScope[], expiresAt: null }
            : grant
              ? { kind: 'GRANT' as const, scopes: grant.scopes, expiresAt: grant.expiresAt }
              : { kind: 'NONE' as const, scopes: [] as PatientDataScope[], expiresAt: null },
        };
      });
  }

  /**
   * Datos del paciente para el médico, limitados a lo que el paciente
   * autorizó (o, en fichas walk-in, a lo que el propio médico cargó). Cada
   * lectura queda en la auditoría con el alcance y el consentimiento usado.
   */
  async readForProfessional(professionalId: string, patientId: string, requestedByUserId: string, ipAddress?: string) {
    const hasRelationship = await this.prisma.appointment.findFirst({
      where: { professionalId, patientId },
      select: { id: true },
    });
    if (!hasRelationship) throw new ForbiddenException('Este paciente no tiene citas contigo');

    const patient = await this.prisma.patientProfile.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    let scopes: PatientDataScope[];
    let grantId: string | null = null;
    let expiresAt: Date | null = null;
    if (patient.createdByProfessionalId === professionalId && !patient.userId) {
      scopes = ['IDENTITY', 'CONTACT'];
    } else {
      const grant = await this.activeGrant(patientId, professionalId);
      if (!grant) {
        throw new ForbiddenException('El paciente no te ha autorizado a ver sus datos. Puedes solicitarle acceso.');
      }
      scopes = grant.scopes;
      grantId = grant.id;
      expiresAt = grant.expiresAt;
    }

    const decoded = this.codec.decode(patient);
    const result = shapeForScopes(decoded, scopes);

    await this.audit.record({
      userId: requestedByUserId,
      action: 'PATIENT_DATA_READ',
      resource: 'PatientProfile',
      resourceId: patient.id,
      details: { professionalId, scopes, grantId, basis: grantId ? 'GRANT' : 'WALK_IN' },
      ipAddress,
    });

    return { ...result, scopes, expiresAt };
  }

  async requestAccess(professionalId: string, patientId: string, requestedByUserId: string, scopes: PatientDataScope[]) {
    const hasRelationship = await this.prisma.appointment.findFirst({
      where: { professionalId, patientId },
      select: { id: true },
    });
    if (!hasRelationship) throw new ForbiddenException('Este paciente no tiene citas contigo');

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: { user: { select: { email: true } } },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    if (!patient.userId || !patient.user) {
      throw new BadRequestException('Este paciente no tiene cuenta; pídele sus datos directamente en consulta');
    }

    const recent = await this.prisma.auditLog.findFirst({
      where: {
        action: 'PATIENT_DATA_ACCESS_REQUESTED',
        resourceId: patientId,
        userId: requestedByUserId,
        createdAt: { gt: new Date(Date.now() - ACCESS_REQUEST_COOLDOWN_MS) },
      },
    });
    if (recent) {
      throw new HttpException('Ya enviaste una solicitud a este paciente en las últimas 24 horas', HttpStatus.TOO_MANY_REQUESTS);
    }

    const professional = await this.prisma.professionalProfile.findUniqueOrThrow({
      where: { id: professionalId },
      select: { firstName: true, lastName: true },
    });

    await this.audit.record({
      userId: requestedByUserId,
      action: 'PATIENT_DATA_ACCESS_REQUESTED',
      resource: 'PatientProfile',
      resourceId: patientId,
      details: { professionalId, scopes },
    });

    await this.notifications.notify({
      userId: patient.userId,
      type: 'PATIENT_DATA_ACCESS_REQUESTED',
      title: 'Un médico solicita acceso a tus datos',
      content: `Dr(a). ${professional.firstName} ${professional.lastName} solicita ver: ${scopes
        .map((s) => SCOPE_LABELS[s])
        .join(', ')}. Tú decides si autorizas y por cuánto tiempo.`,
      email: {
        to: patient.user.email,
        subject: 'Solicitud de acceso a tus datos — Guía Médica Monagas',
        template: 'patient_data_access_requested',
        html: patientDataAccessRequestedTemplate(
          patient.firstName ?? 'Paciente',
          `${professional.firstName} ${professional.lastName}`,
          scopes.map((s) => SCOPE_LABELS[s]),
          `${FRONTEND_URL}/paciente/permisos`,
        ),
      },
    });

    return { message: 'Solicitud enviada al paciente' };
  }

  private translateUniqueError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String((error.meta as { target?: unknown } | undefined)?.target ?? '');
      if (target.includes('phoneLookup')) return new ConflictException('Este número de teléfono ya está registrado');
      if (target.includes('cedulaLookup')) return new ConflictException('Ya existe una cuenta registrada con esta cédula');
      return new ConflictException('Estos datos ya están asociados a otra cuenta');
    }
    return error;
  }
}

/** Recorta los datos descifrados al alcance autorizado. */
export function shapeForScopes(patient: DecodedPatient, scopes: PatientDataScope[]) {
  const has = (s: PatientDataScope) => scopes.includes(s);
  return {
    patientId: patient.id,
    patientCode: patient.patientCode,
    identity: has('IDENTITY')
      ? {
          firstName: patient.firstName,
          lastName: patient.lastName,
          identityVerified: patient.identityStatus === 'VERIFIED',
        }
      : null,
    contact: has('CONTACT')
      ? {
          phone: patient.phone,
          emergencyMedicalPhone: patient.emergencyMedicalPhone,
          emergencyAddress: patient.emergencyAddress,
        }
      : null,
    health: has('HEALTH')
      ? {
          birthDate: patient.birthDate,
          sex: patient.sex,
          bloodType: patient.bloodType,
          allergies: patient.allergies,
          isHealthy: patient.isHealthy,
          conditionSummary: patient.conditionSummary,
          medications: patient.medications,
          treatingDoctors: patient.treatingDoctors,
        }
      : null,
  };
}
