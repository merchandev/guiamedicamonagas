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
import {
  identityReviewedTemplate,
  patientDataAccessRequestedTemplate,
  patientRegisteredByCodeTemplate,
} from '../mail/mail.templates';
import { generatePatientCode } from './patient-code.util';
import { formatShareCode, generateShareCode, normalizeShareCode } from './share-code.util';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { CreatePatientDataGrantDto, DEFAULT_GRANT_DAYS, MAX_GRANT_DAYS } from './dto/patient-data-grant.dto';
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

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCESS_REQUEST_COOLDOWN_MS = DAY_MS;
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
/** Registrar al paciente con su código lo autoriza por un año; el paciente lo revoca cuando quiera. */
const SHARE_CODE_GRANT_DAYS = MAX_GRANT_DAYS;
export const SHARE_CODE_GRANT_REASON = 'Registro con el código del paciente';

type DirectoryPatient = {
  patientCode: string;
  userId: string | null;
  createdByProfessionalId: string | null;
  firstName: string | null;
  lastName: string | null;
};

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
    // Lo del código para compartir va solo por /patients/me/share-code.
    const {
      photoKey: _p,
      idPhotoKey,
      createdByProfessionalId: _c,
      identityReviewedById: _r,
      shareCodeCreatedAt: _sc,
      shareScopes: _ss,
      ...rest
    } = decoded;
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

  // --- Código para compartir con el médico (texto y QR) ---------------------

  private shareCodeView(profile: PatientProfile) {
    const code = this.codec.decodeShareCode(profile);
    const formatted = code ? formatShareCode(code) : null;
    return {
      code: formatted,
      // El QR abre esta ruta: no muestra nada del paciente y lleva al médico a
      // registrarlo desde su panel.
      url: formatted ? `${FRONTEND_URL}/p/${formatted}` : null,
      createdAt: profile.shareCodeCreatedAt,
      scopes: profile.shareScopes,
    };
  }

  async getShareCode(userId: string) {
    return this.shareCodeView(await this.ownProfileOrThrow(userId));
  }

  /** Genera el código, o uno nuevo: el anterior deja de servir al instante. */
  async rotateShareCode(userId: string, ipAddress?: string) {
    const profile = await this.ownProfileOrThrow(userId);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateShareCode();
      try {
        const updated = await this.prisma.patientProfile.update({
          where: { id: profile.id },
          data: { ...this.codec.encodeShareCode(code), shareCodeCreatedAt: new Date() },
        });
        await this.audit.record({
          userId,
          action: profile.shareCodeLookup ? 'PATIENT_SHARE_CODE_ROTATED' : 'PATIENT_SHARE_CODE_CREATED',
          resource: 'PatientProfile',
          resourceId: profile.id,
          ipAddress,
        });
        return this.shareCodeView(updated);
      } catch (error) {
        // Colisión con el código de otro paciente (improbable): se genera otro.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    throw new ConflictException('No se pudo generar el código; intenta de nuevo');
  }

  async updateShareScopes(userId: string, scopes: PatientDataScope[]) {
    const profile = await this.ownProfileOrThrow(userId);
    const updated = await this.prisma.patientProfile.update({ where: { id: profile.id }, data: { shareScopes: scopes } });
    return this.shareCodeView(updated);
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

  /** Médicos con los que el paciente tiene o tuvo citas, o que lo registraron: candidatos a recibir acceso. */
  async listOwnProfessionals(userId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const select = { id: true, slug: true, firstName: true, lastName: true } as const;
    const [byAppointment, byCode] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId: profile.id },
        distinct: ['professionalId'],
        select: { professional: { select } },
      }),
      this.prisma.professionalPatient.findMany({ where: { patientId: profile.id }, select: { professional: { select } } }),
    ]);
    const unique = new Map([...byAppointment, ...byCode].map((r) => [r.professional.id, r.professional]));
    return [...unique.values()];
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

    const now = new Date();
    const revoked = await this.prisma.patientDataGrant.update({ where: { id: grantId }, data: { revokedAt: now } });
    // Si el médico lo registró con el código, ese mismo código ya no le devuelve el acceso.
    await this.prisma.professionalPatient.updateMany({
      where: { patientId: profile.id, professionalId: grant.professionalId },
      data: { accessRevokedAt: now },
    });
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

  /** Un médico solo trata con pacientes con los que tiene citas o que registró con su código. */
  private async hasRelationship(professionalId: string, patientId: string) {
    const [appointment, link] = await Promise.all([
      this.prisma.appointment.findFirst({ where: { professionalId, patientId }, select: { id: true } }),
      this.prisma.professionalPatient.findUnique({
        where: { professionalId_patientId: { professionalId, patientId } },
        select: { id: true },
      }),
    ]);
    return !!appointment || !!link;
  }

  /**
   * Directorio de pacientes de un profesional: los que tuvieron citas con él y
   * los que registró con su código. El nombre solo aparece si el paciente
   * autorizó su identidad (o si es una ficha walk-in que cargó el propio
   * médico); si no, solo el código. Mostrar nombres queda auditado.
   */
  async listForProfessional(professionalId: string, requestedByUserId?: string, ipAddress?: string) {
    const patientSelect = { patientCode: true, userId: true, createdByProfessionalId: true, firstName: true, lastName: true } as const;
    const [appointments, links] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { professionalId },
        select: { patientId: true, startsAt: true, patient: { select: patientSelect } },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.professionalPatient.findMany({
        where: { professionalId },
        select: { patientId: true, createdAt: true, patient: { select: patientSelect } },
      }),
    ]);

    type Entry = {
      patientId: string;
      patient: DirectoryPatient;
      appointmentCount: number;
      lastVisit: Date | null;
      registeredAt: Date | null;
    };
    const byPatient = new Map<string, Entry>();
    for (const appt of appointments) {
      const existing = byPatient.get(appt.patientId);
      if (existing) existing.appointmentCount += 1;
      else
        byPatient.set(appt.patientId, {
          patientId: appt.patientId,
          patient: appt.patient,
          appointmentCount: 1,
          lastVisit: appt.startsAt,
          registeredAt: null,
        });
    }
    for (const link of links) {
      const existing = byPatient.get(link.patientId);
      if (existing) existing.registeredAt = link.createdAt;
      else
        byPatient.set(link.patientId, {
          patientId: link.patientId,
          patient: link.patient,
          appointmentCount: 0,
          lastVisit: null,
          registeredAt: link.createdAt,
        });
    }

    const patientIds = [...byPatient.keys()];
    const grants = await this.prisma.patientDataGrant.findMany({
      where: { professionalId, patientId: { in: patientIds }, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { patientId: true, scopes: true, expiresAt: true },
    });
    const grantByPatient = new Map(grants.map((g) => [g.patientId, g]));

    const latest = (e: Entry) => Math.max(e.lastVisit?.getTime() ?? 0, e.registeredAt?.getTime() ?? 0);
    const items = [...byPatient.values()]
      .sort((a, b) => latest(b) - latest(a))
      .map(({ patient, ...entry }) => {
        const createdByMe = patient.createdByProfessionalId === professionalId && !patient.userId;
        const grant = grantByPatient.get(entry.patientId);
        const access = createdByMe
          ? { kind: 'WALK_IN' as const, scopes: ['IDENTITY', 'CONTACT'] as PatientDataScope[], expiresAt: null }
          : grant
            ? { kind: 'GRANT' as const, scopes: grant.scopes, expiresAt: grant.expiresAt }
            : { kind: 'NONE' as const, scopes: [] as PatientDataScope[], expiresAt: null };
        return {
          ...entry,
          patientCode: patient.patientCode,
          hasAccount: !!patient.userId,
          createdByMe,
          registered: !!entry.registeredAt,
          identity: access.scopes.includes('IDENTITY') ? { firstName: patient.firstName, lastName: patient.lastName } : null,
          access,
        };
      });

    const named = items.filter((i) => i.identity && i.access.kind === 'GRANT').map((i) => i.patientId);
    if (named.length && requestedByUserId) {
      await this.audit.record({
        userId: requestedByUserId,
        action: 'PATIENT_DIRECTORY_VIEWED',
        resource: 'ProfessionalProfile',
        resourceId: professionalId,
        details: { patientIds: named.slice(0, 200), count: named.length },
        ipAddress,
      });
    }
    return items;
  }

  /**
   * El médico registra a un paciente con el código (o el QR) que el paciente
   * le entregó. Entregar el código es el consentimiento: el médico recibe una
   * autorización por los alcances que el paciente eligió para su código,
   * durante un año, revocable desde «Permisos». Si el paciente ya le había
   * revocado el acceso, hace falta un código nuevo. Un código inválido no
   * revela si existe un paciente.
   */
  async registerByShareCode(professionalId: string, rawCode: string, requestedByUserId: string, ipAddress?: string) {
    const code = normalizeShareCode(rawCode);
    const patient = code
      ? await this.prisma.patientProfile.findUnique({
          where: { shareCodeLookup: this.codec.shareCodeLookup(code) },
          include: { user: { select: { email: true } } },
        })
      : null;
    if (!patient?.userId || !patient.user) {
      await this.audit.record({
        userId: requestedByUserId,
        action: 'PATIENT_SHARE_CODE_FAILED',
        resource: 'ProfessionalProfile',
        resourceId: professionalId,
        ipAddress,
      });
      throw new NotFoundException('Código de paciente no válido. Pídele al paciente que lo revise o que genere uno nuevo.');
    }

    const professional = await this.prisma.professionalProfile.findUniqueOrThrow({
      where: { id: professionalId },
      select: { userId: true, firstName: true, lastName: true, isPublished: true, verificationStatus: true },
    });
    if (professional.userId === patient.userId) throw new BadRequestException('No puedes registrarte como tu propio paciente');
    if (professional.verificationStatus === 'SUSPENDED' || (!professional.isPublished && professional.verificationStatus !== 'VERIFIED')) {
      throw new ForbiddenException('Podrás registrar pacientes cuando tu perfil esté publicado en el directorio');
    }

    const link = await this.prisma.professionalPatient.findUnique({
      where: { professionalId_patientId: { professionalId, patientId: patient.id } },
    });
    if (link?.accessRevokedAt && patient.shareCodeCreatedAt && link.accessRevokedAt > patient.shareCodeCreatedAt) {
      throw new ForbiddenException('El paciente retiró tu acceso. Para registrarlo de nuevo necesitas un código nuevo del paciente.');
    }

    const now = new Date();
    const scopes = patient.shareScopes;
    const grant = await this.prisma.$transaction(async (tx) => {
      await tx.professionalPatient.upsert({
        where: { professionalId_patientId: { professionalId, patientId: patient.id } },
        create: { professionalId, patientId: patient.id },
        update: { accessRevokedAt: null },
      });
      await tx.patientDataGrant.updateMany({
        where: { patientId: patient.id, professionalId, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      return tx.patientDataGrant.create({
        data: {
          patientId: patient.id,
          professionalId,
          scopes,
          reason: SHARE_CODE_GRANT_REASON,
          expiresAt: new Date(now.getTime() + SHARE_CODE_GRANT_DAYS * DAY_MS),
          grantedById: patient.userId,
          consentVersion: PATIENT_CONSENT_VERSION,
        },
      });
    });

    await this.audit.record({
      userId: requestedByUserId,
      action: 'PATIENT_REGISTERED_BY_CODE',
      resource: 'PatientProfile',
      resourceId: patient.id,
      details: { professionalId, grantId: grant.id, scopes, consentVersion: PATIENT_CONSENT_VERSION },
      ipAddress,
    });

    const doctorName = `${professional.firstName} ${professional.lastName}`;
    const scopeLabels = scopes.map((s) => SCOPE_LABELS[s]);
    await this.notifications.notify({
      userId: patient.userId,
      type: 'PATIENT_REGISTERED_BY_CODE',
      title: 'Un médico te registró como paciente',
      content: `Dr(a). ${doctorName} te registró con tu código y puede ver: ${scopeLabels.join(', ')}. Puedes revocarlo en Permisos.`,
      email: {
        to: patient.user.email,
        subject: 'Un médico te registró como paciente — Guía Médica Monagas',
        template: 'patient_registered_by_code',
        html: patientRegisteredByCodeTemplate(patient.firstName ?? 'Paciente', doctorName, scopeLabels, `${FRONTEND_URL}/paciente/permisos`),
      },
    });

    return { patientId: patient.id, patientCode: patient.patientCode, scopes, expiresAt: grant.expiresAt };
  }

  /** Quita al paciente del directorio del médico y cierra su acceso a los datos. */
  async removeFromDirectory(professionalId: string, patientId: string, requestedByUserId: string, ipAddress?: string) {
    const removed = await this.prisma.professionalPatient.deleteMany({ where: { professionalId, patientId } });
    if (!removed.count) throw new NotFoundException('Este paciente no está registrado en tu directorio');
    await this.prisma.patientDataGrant.updateMany({
      where: { patientId, professionalId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      userId: requestedByUserId,
      action: 'PATIENT_REMOVED_FROM_DIRECTORY',
      resource: 'PatientProfile',
      resourceId: patientId,
      details: { professionalId },
      ipAddress,
    });
    return { removed: true };
  }

  /**
   * Datos del paciente para el médico, limitados a lo que el paciente
   * autorizó (o, en fichas walk-in, a lo que el propio médico cargó). Cada
   * lectura queda en la auditoría con el alcance y el consentimiento usado.
   */
  async readForProfessional(professionalId: string, patientId: string, requestedByUserId: string, ipAddress?: string) {
    if (!(await this.hasRelationship(professionalId, patientId))) {
      throw new ForbiddenException('Este paciente no tiene citas contigo ni está registrado en tu directorio');
    }

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
    if (!(await this.hasRelationship(professionalId, patientId))) {
      throw new ForbiddenException('Este paciente no tiene citas contigo ni está registrado en tu directorio');
    }

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
