import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LegalAcceptanceService } from '../legal/legal-acceptance.service';
import { PatientDataCodec } from './patient-data.codec';

/** Eventos sobre la ficha del paciente que él mismo puede consultar. */
const PROFILE_EVENTS = [
  'PATIENT_DATA_READ',
  'PATIENT_DATA_ACCESS_REQUESTED',
  'PATIENT_REGISTERED_BY_CODE',
  'PATIENT_REMOVED_FROM_DIRECTORY',
  'PATIENT_IDENTITY_DOCUMENT_VIEWED',
  'PATIENT_IDENTITY_VERIFIED',
  'PATIENT_IDENTITY_REJECTED',
  'PATIENT_SHARE_CODE_CREATED',
  'PATIENT_SHARE_CODE_ROTATED',
];
const GRANT_EVENTS = ['PATIENT_DATA_GRANTED', 'PATIENT_DATA_REVOKED'];
const ACCESS_LOG_LIMIT = 300;

/**
 * Derechos del paciente sobre su información (Constitución, art. 28):
 * saber quién accedió a sus datos y obtener una copia de todo lo que la
 * plataforma guarda sobre él.
 */
@Injectable()
export class PatientPrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codec: PatientDataCodec,
    private readonly audit: AuditService,
    private readonly legal: LegalAcceptanceService,
  ) {}

  private async ownProfile(userId: string) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes una ficha de paciente todavía');
    return profile;
  }

  /** Quién vio o pidió ver tus datos, y las autorizaciones que diste o revocaste. */
  async accessLog(userId: string) {
    const profile = await this.ownProfile(userId);
    return this.buildAccessLog(profile.id);
  }

  private async buildAccessLog(patientId: string) {
    const grantIds = (
      await this.prisma.patientDataGrant.findMany({ where: { patientId }, select: { id: true } })
    ).map((grant) => grant.id);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { resource: 'PatientProfile', resourceId: patientId, action: { in: PROFILE_EVENTS } },
          ...(grantIds.length ? [{ resource: 'PatientDataGrant', resourceId: { in: grantIds }, action: { in: GRANT_EVENTS } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: ACCESS_LOG_LIMIT,
      select: { id: true, action: true, createdAt: true, details: true },
    });
    const professionalIds = [
      ...new Set(
        rows
          .map((row) => (row.details as { professionalId?: unknown } | null)?.professionalId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const professionals = professionalIds.length
      ? await this.prisma.professionalProfile.findMany({
          where: { id: { in: professionalIds } },
          select: { id: true, firstName: true, lastName: true, slug: true, isPublished: true },
        })
      : [];
    return rows.map((row) => {
      const details = (row.details ?? {}) as { professionalId?: string; scopes?: string[] };
      const professional = professionals.find((p) => p.id === details.professionalId);
      return {
        id: row.id,
        action: row.action,
        at: row.createdAt,
        scopes: Array.isArray(details.scopes) ? details.scopes : null,
        professional: professional
          ? { name: `Dr(a). ${professional.firstName} ${professional.lastName}`, slug: professional.isPublished ? professional.slug : null }
          : null,
      };
    });
  }

  /** Copia de todos tus datos en un archivo (derecho de acceso y copia). */
  async exportData(userId: string, ipAddress?: string) {
    const [user, profile] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, role: true, isEmailVerified: true, createdAt: true, lastLoginAt: true },
      }),
      this.ownProfile(userId),
    ]);
    const decoded = this.codec.decode(profile);
    const [grants, professionals, appointments, accessLog, legalAcceptances, legalRequests] = await Promise.all([
      this.prisma.patientDataGrant.findMany({
        where: { patientId: profile.id },
        orderBy: { grantedAt: 'desc' },
        select: {
          scopes: true, grantedAt: true, expiresAt: true, revokedAt: true, consentVersion: true, reason: true,
          professional: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.professionalPatient.findMany({
        where: { patientId: profile.id },
        select: { createdAt: true, accessRevokedAt: true, professional: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.appointment.findMany({
        where: { patientId: profile.id },
        orderBy: { startsAt: 'desc' },
        select: {
          startsAt: true, endsAt: true, status: true, source: true, reason: true, createdAt: true,
          professional: { select: { firstName: true, lastName: true } },
          location: { select: { name: true, address: true } },
        },
      }),
      this.buildAccessLog(profile.id),
      this.legal.listOwn(userId),
      this.prisma.legalRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { ticket: true, category: true, status: true, createdAt: true, resolvedAt: true, resolution: true },
      }),
    ]);

    await this.audit.record({ userId, action: 'PATIENT_DATA_EXPORTED', resource: 'PatientProfile', resourceId: profile.id, ipAddress });

    const doctor = (p: { firstName: string; lastName: string }) => `Dr(a). ${p.firstName} ${p.lastName}`;
    return {
      generatedAt: new Date().toISOString(),
      notice:
        'Copia de los datos que Guía Médica Monagas guarda sobre ti. Contiene información de salud: guárdala en un lugar seguro. ' +
        'Las notas internas de cada médico forman parte de su propio registro profesional y no se incluyen.',
      account: user,
      profile: {
        patientCode: decoded.patientCode,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        cedula: decoded.cedula,
        phone: decoded.phone,
        municipality: decoded.municipality,
        identityStatus: decoded.identityStatus,
        hasProfilePhoto: !!profile.photoKey,
        hasIdentityPhoto: !!profile.idPhotoKey,
        health: {
          birthDate: decoded.birthDate,
          sex: decoded.sex,
          bloodType: decoded.bloodType,
          allergies: decoded.allergies,
          isHealthy: decoded.isHealthy,
          conditionSummary: decoded.conditionSummary,
          medications: decoded.medications,
          treatingDoctors: decoded.treatingDoctors,
          emergencyAddress: decoded.emergencyAddress,
          emergencyMedicalPhone: decoded.emergencyMedicalPhone,
        },
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
      authorizations: grants.map(({ professional, ...grant }) => ({ ...grant, professional: doctor(professional) })),
      registeredWithProfessionals: professionals.map(({ professional, ...link }) => ({ ...link, professional: doctor(professional) })),
      appointments: appointments.map(({ professional, reason, ...appointment }) => ({
        ...appointment,
        professional: doctor(professional),
        reason: this.codec.decodeAppointmentReason(reason),
      })),
      accessLog,
      legalAcceptances,
      legalRequests,
    };
  }
}
