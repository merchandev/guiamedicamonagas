import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prescription, PrescriptionPad, ProfessionalProfile } from '@prisma/client';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PatientsService } from '../patients/patients.service';
import { PatientDataCodec } from '../patients/patient-data.codec';
import { formatShareCode, generateShareCode, normalizeShareCode } from '../patients/share-code.util';
import { formatCedula } from '../crypto/field-encryption.service';
import { caracasDayKey, caracasEndOfDay, caracasLongDate } from '../common/caracas-time';
import { PRESCRIPTION_RULES_VERSION } from '../common/legal-versions';
import { prescriptionAnnulledTemplate, prescriptionReceivedTemplate, prescriptionSharedTemplate } from '../mail/mail.templates';
import { PrescriptionCodec } from './prescription.codec';
import {
  itemsSummary,
  PRESCRIPTION_MAX_ITEMS,
  PrescriptionContent,
  prescriptionDisplayStatus,
  prescriptionHash,
  prescriptionNumberLabel,
  shortFingerprint,
} from './prescription-content';
import { PadImages, prescriptionFits, PrescriptionPdfInput, PrescriptionTooLongError, renderPrescriptionPdf } from './prescription-pdf';
import { PAD_IMAGE_FIELD, PadImageKind, preparePadImage } from './pad-images';
import {
  AnnulPrescriptionDto,
  DeliverPrescriptionDto,
  EmailPrescriptionDto,
  IssuePrescriptionDto,
  PrescriptionListDto,
  UpdatePrescriptionPadDto,
} from './dto/prescriptions.dto';

/** Lo que le falta al médico para emitir: verificación completa, datos del perfil y talonario. */
export type PrescriptionRequirement = 'VERIFICATION' | 'MPPS' | 'CEDULA' | 'RULES' | 'ESTABLISHMENT' | 'SIGNATURE' | 'SEAL';

type ProfessionalWithPad = ProfessionalProfile & {
  specialties: { specialty: { name: string } }[];
  prescriptionPad: PrescriptionPad | null;
};

const PAGE_SIZE = 20;
/** Con búsqueda, se revisan los récipes más recientes (el contenido va cifrado). */
const SEARCH_WINDOW = 500;
const MAX_EMAILS_PER_PRESCRIPTION = 5;
const NO_IMAGES: PadImages = { logo: null, signature: null, seal: null };

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** «j123456789» → «J-12345678-9» */
function formatRif(rif: string): string {
  const clean = rif.toUpperCase().replace(/[^VEJPG0-9]/g, '');
  return `${clean.charAt(0)}-${clean.slice(1, -1)}-${clean.slice(-1)}`;
}

/** «pedro@gmail.com» → «pe***@gmail.com» (para la auditoría). */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

/**
 * Récipes digitales (Resolución 031/2013 del MPPS y Ley de Medicamentos). El
 * médico verificado arma su talonario (establecimiento, logo, firma y sello),
 * emite récipes que no se editan (se anulan y se emite otro) y los comparte:
 * dentro de la plataforma con un paciente de su directorio, por correo con el
 * PDF adjunto, o con el enlace y el código de verificación (WhatsApp). El
 * paciente los ve en «Mis récipes» y puede agregar uno con su código si la
 * cédula impresa es la suya. Quien tenga el código (la farmacia) lo verifica.
 * Con PRESCRIPTIONS_ENABLED=false nada de esto responde.
 */
@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly patients: PatientsService,
    private readonly patientCodec: PatientDataCodec,
    private readonly codec: PrescriptionCodec,
  ) {}

  get enabled(): boolean {
    return this.config.get('PRESCRIPTIONS_ENABLED', { infer: true }) === true;
  }

  private assertEnabled() {
    if (!this.enabled) throw new NotFoundException('Los récipes digitales aún no están disponibles');
  }

  publicConfig() {
    return { enabled: this.enabled, rulesVersion: PRESCRIPTION_RULES_VERSION, maxItems: PRESCRIPTION_MAX_ITEMS };
  }

  private get frontendUrl(): string {
    return this.config.get('FRONTEND_URL', { infer: true }).replace(/\/+$/, '');
  }

  /** El código va en el fragmento (#): no viaja al servidor ni a la vista previa de WhatsApp. */
  private verifyUrl(code: string): string {
    return `${this.frontendUrl}/recipe#${formatShareCode(code)}`;
  }

  private pdfInput(input: Omit<PrescriptionPdfInput, 'verifyUrl' | 'verifyLabel'>): PrescriptionPdfInput {
    return { ...input, verifyUrl: this.verifyUrl(input.code), verifyLabel: `${new URL(this.frontendUrl).host}/recipe` };
  }

  // --- Médico: talonario --------------------------------------------------

  private async professionalOrThrow(userId: string): Promise<ProfessionalWithPad> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      include: { specialties: { include: { specialty: { select: { name: true } } } }, prescriptionPad: true },
    });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    return profile;
  }

  private missingRequirements(profile: ProfessionalWithPad): PrescriptionRequirement[] {
    const pad = profile.prescriptionPad;
    const missing: PrescriptionRequirement[] = [];
    // Solo un médico con el 100 % de sus documentos aprobados (título, registro
    // MPPS, Colegio, artículo 8, cédula y RIF) emite: el récipe lleva el código
    // de verificación de la plataforma.
    if (profile.verificationStatus !== 'VERIFIED') missing.push('VERIFICATION');
    if (!profile.mppsNumber?.trim()) missing.push('MPPS');
    if (!profile.cedula?.trim()) missing.push('CEDULA');
    if (pad?.rulesVersion !== PRESCRIPTION_RULES_VERSION) missing.push('RULES');
    if (!pad?.establishmentName || !pad.establishmentAddress || !pad.establishmentRif || !pad.city) missing.push('ESTABLISHMENT');
    if (!pad?.signatureKey) missing.push('SIGNATURE');
    if (!pad?.sealKey) missing.push('SEAL');
    return missing;
  }

  private prescriberSnapshot(profile: ProfessionalWithPad): PrescriptionContent['prescriber'] {
    return {
      fullName: `${profile.firstName} ${profile.lastName}`.trim(),
      cedula: profile.cedula ? formatCedula(profile.cedula) : '',
      mppsNumber: profile.mppsNumber?.trim() ?? '',
      colegioNumber: profile.colmedMonagasNumber?.trim() || null,
      specialties: profile.specialties.map((s) => s.specialty.name),
    };
  }

  private signedImage(key: string | null | undefined) {
    return key ? this.storage.getSignedDownloadUrl(key, 3600, false).catch(() => null) : Promise.resolve(null);
  }

  async getPad(userId: string) {
    this.assertEnabled();
    const profile = await this.professionalOrThrow(userId);
    const pad = profile.prescriptionPad;
    const [logoUrl, signatureUrl, sealUrl] = await Promise.all([
      this.signedImage(pad?.logoKey),
      this.signedImage(pad?.signatureKey),
      this.signedImage(pad?.sealKey),
    ]);
    const missing = this.missingRequirements(profile);
    return {
      prescriber: { ...this.prescriberSnapshot(profile), verificationStatus: profile.verificationStatus },
      // Sin talonario guardado, se proponen los datos del perfil.
      pad: {
        saved: !!pad,
        establishmentName: pad?.establishmentName ?? null,
        establishmentAddress: pad?.establishmentAddress ?? profile.address ?? null,
        establishmentRif: pad?.establishmentRif ?? profile.rif ?? null,
        establishmentPhone: pad?.establishmentPhone ?? profile.phone ?? null,
        city: pad?.city ?? (profile.municipality ? `${profile.municipality}, estado Monagas` : null),
        defaultValidityDays: pad?.defaultValidityDays ?? 30,
        rulesAcceptedAt: pad?.rulesVersion === PRESCRIPTION_RULES_VERSION ? pad.rulesAcceptedAt : null,
        lastNumber: pad?.lastNumber ?? 0,
        logoUrl,
        signatureUrl,
        sealUrl,
      },
      rulesVersion: PRESCRIPTION_RULES_VERSION,
      missing,
      canIssue: missing.length === 0,
    };
  }

  async updatePad(userId: string, dto: UpdatePrescriptionPadDto, ipAddress?: string) {
    this.assertEnabled();
    const profile = await this.professionalOrThrow(userId);
    const { acceptRules, ...fields } = dto;
    const data = {
      ...fields,
      ...(acceptRules ? { rulesVersion: PRESCRIPTION_RULES_VERSION, rulesAcceptedAt: new Date() } : {}),
    };
    await this.prisma.prescriptionPad.upsert({
      where: { professionalId: profile.id },
      create: { professionalId: profile.id, ...data },
      update: data,
    });
    if (acceptRules) {
      await this.audit.record({
        userId,
        action: 'PRESCRIPTION_RULES_ACCEPTED',
        resource: 'ProfessionalProfile',
        resourceId: profile.id,
        details: { version: PRESCRIPTION_RULES_VERSION },
        ipAddress,
      });
    }
    return this.getPad(userId);
  }

  async setPadImage(userId: string, kind: PadImageKind, image: Buffer, ipAddress?: string) {
    this.assertEnabled();
    const profile = await this.professionalOrThrow(userId);
    const png = await preparePadImage(kind, image);
    const key = this.storage.buildKey('prescription-pads', 'png');
    await this.storage.uploadPrivateObject(key, png, 'image/png');
    const field = PAD_IMAGE_FIELD[kind];
    const previous = profile.prescriptionPad?.[field] ?? null;
    await this.prisma.prescriptionPad.upsert({
      where: { professionalId: profile.id },
      create: { professionalId: profile.id, [field]: key },
      update: { [field]: key },
    });
    await this.deleteImageIfUnused(previous);
    await this.audit.record({
      userId,
      action: 'PRESCRIPTION_PAD_IMAGE_UPDATED',
      resource: 'ProfessionalProfile',
      resourceId: profile.id,
      details: { kind },
      ipAddress,
    });
    return this.getPad(userId);
  }

  async removePadImage(userId: string, kind: PadImageKind, ipAddress?: string) {
    this.assertEnabled();
    const profile = await this.professionalOrThrow(userId);
    const field = PAD_IMAGE_FIELD[kind];
    const previous = profile.prescriptionPad?.[field] ?? null;
    if (previous) {
      await this.prisma.prescriptionPad.update({ where: { professionalId: profile.id }, data: { [field]: null } });
      await this.deleteImageIfUnused(previous);
      await this.audit.record({
        userId,
        action: 'PRESCRIPTION_PAD_IMAGE_REMOVED',
        resource: 'ProfessionalProfile',
        resourceId: profile.id,
        details: { kind },
        ipAddress,
      });
    }
    return this.getPad(userId);
  }

  /** Una imagen que ya salió en un récipe se conserva: ese récipe se sigue imprimiendo igual. */
  private async deleteImageIfUnused(key: string | null) {
    if (!key) return;
    const used = await this.prisma.prescription.count({
      where: { OR: [{ logoKey: key }, { signatureKey: key }, { sealKey: key }] },
    });
    if (!used) await this.storage.deleteObject(key).catch(() => undefined);
  }

  private async loadImages(keys: { logoKey: string | null; signatureKey: string | null; sealKey: string | null }, required: boolean): Promise<PadImages> {
    const load = async (key: string | null, mandatory: boolean) => {
      if (!key) return null;
      try {
        return await this.storage.getObjectBuffer(key);
      } catch (error) {
        this.logger.error(`No se pudo leer una imagen del talonario: ${(error as Error).message}`);
        if (mandatory) {
          throw new ServiceUnavailableException('No se pudieron cargar la firma o el sello del récipe. Intenta de nuevo en unos minutos.');
        }
        return null;
      }
    };
    const [logo, signature, seal] = await Promise.all([
      load(keys.logoKey, false),
      load(keys.signatureKey, required),
      load(keys.sealKey, required),
    ]);
    return { logo, signature, seal };
  }

  /** PDF de muestra con el talonario actual y la marca «MUESTRA», para revisar el diseño. */
  async previewPdf(userId: string) {
    this.assertEnabled();
    const profile = await this.professionalOrThrow(userId);
    const pad = profile.prescriptionPad;
    const prescriber = this.prescriberSnapshot(profile);
    const now = new Date();
    const content: PrescriptionContent = {
      prescriber: { ...prescriber, cedula: prescriber.cedula || 'V-00000000', mppsNumber: prescriber.mppsNumber || '00000' },
      establishment: {
        name: pad?.establishmentName ?? 'Nombre del consultorio',
        address: pad?.establishmentAddress ?? 'Dirección del consultorio',
        rif: pad?.establishmentRif ? formatRif(pad.establishmentRif) : 'J-00000000-0',
        phone: pad?.establishmentPhone ?? null,
      },
      place: pad?.city ?? 'Maturín, estado Monagas',
      patient: { fullName: 'Paciente de ejemplo', cedula: 'V-00000000', birthYear: 1990, guardian: null },
      items: [
        {
          activeIngredient: 'Amoxicilina',
          concentration: '500 mg',
          pharmaceuticalForm: 'Cápsulas',
          route: 'oral',
          dose: '1 cápsula cada 8 horas',
          duration: '7 días',
          quantity: '21 cápsulas',
          brandNames: null,
          nonSubstitutable: false,
          instructions: 'Tomar con alimentos.',
        },
      ],
      pharmacistNotes: null,
      patientInstructions: 'Aquí van las indicaciones generales para el paciente.',
    };
    const buffer = await renderPrescriptionPdf(
      this.pdfInput({
        number: (pad?.lastNumber ?? 0) + 1,
        code: '000000000000',
        fingerprint: '0000 0000 0000',
        issuedAt: now,
        expiresAt: caracasEndOfDay(now, pad?.defaultValidityDays ?? 30),
        content,
        images: pad ? await this.loadImages(pad, false) : NO_IMAGES,
        watermark: 'MUESTRA · SIN VALIDEZ',
      }),
    );
    return { buffer, filename: 'recipe-muestra.pdf' };
  }

  // --- Médico: pacientes del directorio -------------------------------------

  /** Pacientes con cuenta del directorio del médico (el nombre, solo si autorizaron su identidad). */
  async listPatients(userId: string, ipAddress?: string) {
    this.assertEnabled();
    const profile = await this.professionalOrThrow(userId);
    const items = await this.patients.listForProfessional(profile.id, userId, ipAddress);
    return items
      .filter((item) => item.hasAccount)
      .map((item) => ({
        patientId: item.patientId,
        patientCode: item.patientCode,
        name: item.identity ? [item.identity.firstName, item.identity.lastName].filter(Boolean).join(' ') || null : null,
      }));
  }

  /** Solo a un paciente con cuenta activa con quien tiene citas o que lo registró con su código (sin revocarlo). */
  private async deliverableOrThrow(professionalId: string, patientId: string) {
    const [patient, appointment, link] = await Promise.all([
      this.prisma.patientProfile.findUnique({
        where: { id: patientId },
        select: { id: true, firstName: true, user: { select: { id: true, email: true, isActive: true, deletedAt: true } } },
      }),
      this.prisma.appointment.findFirst({ where: { professionalId, patientId }, select: { id: true } }),
      this.prisma.professionalPatient.findUnique({
        where: { professionalId_patientId: { professionalId, patientId } },
        select: { accessRevokedAt: true },
      }),
    ]);
    const related = !!appointment || (!!link && !link.accessRevokedAt);
    if (!patient?.user?.isActive || patient.user.deletedAt || !related) {
      throw new NotFoundException('Ese paciente no está en tu directorio o no tiene una cuenta activa');
    }
    return { id: patient.id, firstName: patient.firstName, userId: patient.user.id, email: patient.user.email };
  }

  // --- Médico: emitir y gestionar -------------------------------------------

  private async newCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateShareCode();
      const taken = await this.prisma.prescription.findUnique({ where: { codeLookup: this.codec.codeLookup(code) }, select: { id: true } });
      if (!taken) return code;
    }
    throw new ServiceUnavailableException('No se pudo generar el código del récipe; intenta de nuevo');
  }

  async issue(userId: string, dto: IssuePrescriptionDto, ipAddress?: string) {
    this.assertEnabled();
    const profile = await this.professionalOrThrow(userId);
    const missing = this.missingRequirements(profile);
    if (missing.length) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Antes de emitir récipes completa tu verificación y tu talonario (firma, sello y establecimiento).',
        missing,
      });
    }
    const currentYear = Number(caracasDayKey(new Date()).slice(0, 4));
    if (dto.patientBirthYear > currentYear) throw new BadRequestException('El año de nacimiento no puede ser futuro');
    const hasGuardian = !!(dto.guardianName || dto.guardianCedula);
    if (hasGuardian && !(dto.guardianName && dto.guardianCedula)) {
      throw new BadRequestException('Del representante hacen falta el nombre y la cédula');
    }
    if (!dto.patientCedula && !hasGuardian) {
      throw new BadRequestException('Indica la cédula del paciente o, si es un menor sin cédula, el nombre y la cédula de su representante');
    }
    const delivery = dto.patientId ? await this.deliverableOrThrow(profile.id, dto.patientId) : null;

    const pad = profile.prescriptionPad!;
    const content: PrescriptionContent = {
      prescriber: this.prescriberSnapshot(profile),
      establishment: {
        name: pad.establishmentName!,
        address: pad.establishmentAddress!,
        rif: formatRif(pad.establishmentRif!),
        phone: pad.establishmentPhone ?? null,
      },
      place: pad.city!,
      patient: {
        fullName: dto.patientName,
        cedula: dto.patientCedula ? formatCedula(dto.patientCedula) : null,
        birthYear: dto.patientBirthYear,
        guardian: hasGuardian ? { fullName: dto.guardianName!, cedula: formatCedula(dto.guardianCedula!) } : null,
      },
      items: dto.items.map((item) => ({
        activeIngredient: item.activeIngredient,
        concentration: item.concentration,
        pharmaceuticalForm: item.pharmaceuticalForm,
        route: item.route,
        dose: item.dose,
        duration: item.duration,
        quantity: item.quantity ?? null,
        brandNames: item.brandNames ?? null,
        nonSubstitutable: item.nonSubstitutable,
        instructions: item.instructions ?? null,
      })),
      pharmacistNotes: dto.pharmacistNotes ?? null,
      patientInstructions: dto.patientInstructions ?? null,
    };
    const issuedAt = new Date();
    const expiresAt = caracasEndOfDay(issuedAt, dto.validityDays);
    const code = await this.newCode();
    const fits = await prescriptionFits(
      this.pdfInput({ number: pad.lastNumber + 1, code, fingerprint: '0000 0000 0000', issuedAt, expiresAt, content, images: NO_IMAGES }),
    );
    if (!fits) throw new BadRequestException(new PrescriptionTooLongError().message);

    const created = await this.prisma.$transaction(async (tx) => {
      const { lastNumber: number } = await tx.prescriptionPad.update({
        where: { professionalId: profile.id },
        data: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      return tx.prescription.create({
        data: {
          professionalId: profile.id,
          number,
          ...this.codec.encodeCode(code),
          patientId: delivery?.id ?? null,
          deliveredAt: delivery ? issuedAt : null,
          patientCedulaLookup: this.patientCodec.cedulaLookup(dto.patientCedula ?? dto.guardianCedula!),
          contentEnc: this.codec.encodeContent(content),
          contentHash: prescriptionHash({ professionalId: profile.id, number, code, issuedAt, expiresAt, content }),
          logoKey: pad.logoKey,
          signatureKey: pad.signatureKey,
          sealKey: pad.sealKey,
          issuedAt,
          expiresAt,
        },
      });
    });
    await this.audit.record({
      userId,
      action: 'PRESCRIPTION_ISSUED',
      resource: 'Prescription',
      resourceId: created.id,
      details: { number: created.number, items: content.items.length, delivered: !!delivery },
      ipAddress,
    });
    if (delivery) await this.notifyDelivered(created, profile, delivery);
    return this.detail(userId, created.id);
  }

  private async notifyDelivered(
    prescription: Prescription,
    profile: ProfessionalProfile,
    patient: { userId: string; email: string; firstName: string | null },
  ) {
    const doctorName = `${profile.firstName} ${profile.lastName}`;
    const link = `/paciente/recipes/${prescription.id}`;
    await this.notifications.notify({
      userId: patient.userId,
      type: 'PRESCRIPTION_RECEIVED',
      title: `Récipe nuevo de Dr(a). ${doctorName}`,
      content: `Récipe N° ${prescriptionNumberLabel(prescription.number)}, vence el ${caracasLongDate(prescription.expiresAt)}. Míralo y descárgalo en «Mis récipes».`,
      link,
      email: {
        to: patient.email,
        subject: 'Tienes un récipe nuevo — Guía Médica Monagas',
        template: 'prescription_received',
        html: prescriptionReceivedTemplate(patient.firstName ?? 'Paciente', doctorName, caracasLongDate(prescription.expiresAt), `${this.frontendUrl}${link}`),
      },
    });
  }

  private present(prescription: Prescription) {
    const content = this.codec.decodeContent(prescription.contentEnc);
    const code = this.codec.decodeCode(prescription.codeEnc);
    return {
      id: prescription.id,
      number: prescription.number,
      numberLabel: prescriptionNumberLabel(prescription.number),
      code: formatShareCode(code),
      verifyUrl: this.verifyUrl(code),
      issuedAt: prescription.issuedAt,
      expiresAt: prescription.expiresAt,
      status: prescriptionDisplayStatus(prescription),
      annulledAt: prescription.annulledAt,
      annulReason: this.codec.decodeAnnulReason(prescription.annulReason),
      fingerprint: shortFingerprint(prescription.contentHash),
      content,
    };
  }

  private async ownPrescriptionOrThrow(userId: string, id: string) {
    const profile = await this.professionalOrThrow(userId);
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, professionalId: profile.id },
      include: { patient: { select: { patientCode: true } } },
    });
    if (!prescription) throw new NotFoundException('Récipe no encontrado');
    return { profile, prescription };
  }

  async list(userId: string, query: PrescriptionListDto) {
    this.assertEnabled();
    const profile = await this.professionalOrThrow(userId);
    const where = { professionalId: profile.id };
    const select = { id: true, number: true, issuedAt: true, expiresAt: true, status: true, contentEnc: true, patientId: true } as const;
    const summary = (row: Pick<Prescription, keyof typeof select>) => {
      const content = this.codec.decodeContent(row.contentEnc);
      return {
        id: row.id,
        number: row.number,
        numberLabel: prescriptionNumberLabel(row.number),
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
        status: prescriptionDisplayStatus(row),
        patientName: content.patient.fullName,
        patientCedula: content.patient.cedula ?? content.patient.guardian?.cedula ?? null,
        itemsSummary: itemsSummary(content.items),
        delivered: !!row.patientId,
      };
    };

    if (!query.q) {
      const page = query.page ?? 1;
      const [total, rows] = await Promise.all([
        this.prisma.prescription.count({ where }),
        this.prisma.prescription.findMany({ where, select, orderBy: { issuedAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      ]);
      return { items: rows.map(summary), total, page, pageSize: PAGE_SIZE };
    }

    const needle = fold(query.q);
    const digits = query.q.replace(/\D/g, '');
    const rows = await this.prisma.prescription.findMany({ where, select, orderBy: { issuedAt: 'desc' }, take: SEARCH_WINDOW });
    const items = rows.map(summary).filter((item) => {
      const cedulaDigits = (item.patientCedula ?? '').replace(/\D/g, '');
      return (
        fold(item.patientName).includes(needle) ||
        fold(item.itemsSummary).includes(needle) ||
        (digits.length >= 1 && (String(item.number) === digits || item.numberLabel === digits)) ||
        (digits.length >= 5 && cedulaDigits.includes(digits))
      );
    });
    return { items: items.slice(0, 50), total: items.length, page: 1, pageSize: 50 };
  }

  async detail(userId: string, id: string) {
    this.assertEnabled();
    const { prescription } = await this.ownPrescriptionOrThrow(userId, id);
    const emailsSent = await this.prisma.auditLog.count({
      where: { resource: 'Prescription', resourceId: prescription.id, action: 'PRESCRIPTION_EMAILED' },
    });
    return {
      ...this.present(prescription),
      deliveredAt: prescription.deliveredAt,
      deliveredTo: prescription.patient?.patientCode ?? null,
      emailsSent,
      emailsLeft: Math.max(0, MAX_EMAILS_PER_PRESCRIPTION - emailsSent),
    };
  }

  private async renderStored(prescription: Prescription) {
    const content = this.codec.decodeContent(prescription.contentEnc);
    const status = prescriptionDisplayStatus(prescription);
    const buffer = await renderPrescriptionPdf(
      this.pdfInput({
        number: prescription.number,
        code: this.codec.decodeCode(prescription.codeEnc),
        fingerprint: shortFingerprint(prescription.contentHash),
        issuedAt: prescription.issuedAt,
        expiresAt: prescription.expiresAt,
        content,
        images: await this.loadImages(prescription, true),
        watermark: status === 'ANNULLED' ? 'ANULADO' : status === 'EXPIRED' ? 'VENCIDO' : null,
      }),
    );
    return { buffer, filename: `recipe-${prescriptionNumberLabel(prescription.number)}.pdf` };
  }

  async pdf(userId: string, id: string) {
    this.assertEnabled();
    const { prescription } = await this.ownPrescriptionOrThrow(userId, id);
    return this.renderStored(prescription);
  }

  async annul(userId: string, id: string, dto: AnnulPrescriptionDto, ipAddress?: string) {
    this.assertEnabled();
    const { profile, prescription } = await this.ownPrescriptionOrThrow(userId, id);
    const now = new Date();
    const { count } = await this.prisma.prescription.updateMany({
      where: { id: prescription.id, status: 'ISSUED' },
      data: { status: 'ANNULLED', annulledAt: now, annulReason: this.codec.encodeAnnulReason(dto.reason) },
    });
    if (!count) throw new ConflictException('Ese récipe ya está anulado');
    await this.audit.record({
      userId,
      action: 'PRESCRIPTION_ANNULLED',
      resource: 'Prescription',
      resourceId: prescription.id,
      details: { number: prescription.number },
      ipAddress,
    });
    if (prescription.patientId) {
      const patient = await this.prisma.patientProfile.findUnique({
        where: { id: prescription.patientId },
        select: { firstName: true, user: { select: { id: true, email: true, isActive: true } } },
      });
      if (patient?.user?.isActive) {
        const doctorName = `${profile.firstName} ${profile.lastName}`;
        const label = prescriptionNumberLabel(prescription.number);
        const link = `/paciente/recipes/${prescription.id}`;
        await this.notifications.notify({
          userId: patient.user.id,
          type: 'PRESCRIPTION_ANNULLED',
          title: `Dr(a). ${doctorName} anuló un récipe`,
          content: `El récipe N° ${label} ya no sirve para comprar medicamentos. El motivo está en «Mis récipes».`,
          link,
          email: {
            to: patient.user.email,
            subject: 'Récipe anulado — Guía Médica Monagas',
            template: 'prescription_annulled',
            html: prescriptionAnnulledTemplate(patient.firstName ?? 'Paciente', doctorName, label, `${this.frontendUrl}${link}`),
          },
        });
      }
    }
    return this.detail(userId, prescription.id);
  }

  /** Copia por correo con el PDF adjunto, al correo que indique el médico (máximo 5 por récipe). */
  async email(userId: string, id: string, dto: EmailPrescriptionDto, ipAddress?: string) {
    this.assertEnabled();
    const { profile, prescription } = await this.ownPrescriptionOrThrow(userId, id);
    if (prescriptionDisplayStatus(prescription) !== 'VALID') {
      throw new BadRequestException('Solo se envían récipes vigentes');
    }
    const sent = await this.prisma.auditLog.count({
      where: { resource: 'Prescription', resourceId: prescription.id, action: 'PRESCRIPTION_EMAILED' },
    });
    if (sent >= MAX_EMAILS_PER_PRESCRIPTION) {
      throw new HttpException(`Ya enviaste este récipe ${MAX_EMAILS_PER_PRESCRIPTION} veces por correo`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const { buffer, filename } = await this.renderStored(prescription);
    const code = this.codec.decodeCode(prescription.codeEnc);
    const label = prescriptionNumberLabel(prescription.number);
    const doctorName = `${profile.firstName} ${profile.lastName}`;
    const delivered = await this.mail.send({
      to: dto.email,
      subject: `Récipe N° ${label} de Dr(a). ${doctorName}`,
      template: 'prescription_shared',
      html: prescriptionSharedTemplate(doctorName, label, caracasLongDate(prescription.expiresAt), formatShareCode(code), this.verifyUrl(code)),
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
    });
    if (!delivered) {
      throw new ServiceUnavailableException('No se pudo enviar el correo. Intenta de nuevo o compártelo por WhatsApp o en PDF.');
    }
    await this.audit.record({
      userId,
      action: 'PRESCRIPTION_EMAILED',
      resource: 'Prescription',
      resourceId: prescription.id,
      details: { number: prescription.number, to: maskEmail(dto.email) },
      ipAddress,
    });
    return { sent: true, emailsLeft: Math.max(0, MAX_EMAILS_PER_PRESCRIPTION - sent - 1) };
  }

  /** Entrega dentro de la plataforma un récipe ya emitido a un paciente del directorio. */
  async deliver(userId: string, id: string, dto: DeliverPrescriptionDto, ipAddress?: string) {
    this.assertEnabled();
    const { profile, prescription } = await this.ownPrescriptionOrThrow(userId, id);
    if (prescription.status === 'ANNULLED') throw new BadRequestException('Ese récipe está anulado');
    const patient = await this.deliverableOrThrow(profile.id, dto.patientId);
    const { count } = await this.prisma.prescription.updateMany({
      where: { id: prescription.id, patientId: null },
      data: { patientId: patient.id, deliveredAt: new Date() },
    });
    if (!count) throw new ConflictException('Ese récipe ya está en la cuenta de un paciente');
    await this.audit.record({
      userId,
      action: 'PRESCRIPTION_DELIVERED',
      resource: 'Prescription',
      resourceId: prescription.id,
      details: { number: prescription.number, patientId: patient.id },
      ipAddress,
    });
    await this.notifyDelivered(prescription, profile, patient);
    return this.detail(userId, prescription.id);
  }

  // --- Paciente -------------------------------------------------------------

  private async ownPatient(userId: string) {
    return this.prisma.patientProfile.findUnique({ where: { userId }, select: { id: true, cedulaLookup: true } });
  }

  async listMine(userId: string) {
    this.assertEnabled();
    const patient = await this.ownPatient(userId);
    if (!patient) return [];
    const rows = await this.prisma.prescription.findMany({
      where: { patientId: patient.id },
      orderBy: { issuedAt: 'desc' },
      take: 200,
      include: { professional: { select: { slug: true, firstName: true, lastName: true, isPublished: true } } },
    });
    return rows.map((row) => {
      const content = this.codec.decodeContent(row.contentEnc);
      return {
        id: row.id,
        numberLabel: prescriptionNumberLabel(row.number),
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
        status: prescriptionDisplayStatus(row),
        patientName: content.patient.fullName,
        itemsSummary: itemsSummary(content.items),
        doctor: {
          name: `${row.professional.firstName} ${row.professional.lastName}`,
          slug: row.professional.isPublished ? row.professional.slug : null,
        },
      };
    });
  }

  private async mineOrThrow(userId: string, id: string) {
    const patient = await this.ownPatient(userId);
    const prescription = patient
      ? await this.prisma.prescription.findFirst({
          where: { id, patientId: patient.id },
          include: { professional: { select: { slug: true, isPublished: true } } },
        })
      : null;
    if (!prescription) throw new NotFoundException('Récipe no encontrado');
    return prescription;
  }

  async detailMine(userId: string, id: string) {
    this.assertEnabled();
    const prescription = await this.mineOrThrow(userId, id);
    const { annulReason, ...rest } = this.present(prescription);
    return {
      ...rest,
      annulReason,
      doctorSlug: prescription.professional.isPublished ? prescription.professional.slug : null,
    };
  }

  async pdfMine(userId: string, id: string) {
    this.assertEnabled();
    return this.renderStored(await this.mineOrThrow(userId, id));
  }

  /**
   * El paciente agrega a «Mis récipes» uno que recibió por WhatsApp, por correo
   * o impreso: hace falta el código y que la cédula impresa (la suya o la de su
   * representante) sea la de su cuenta.
   */
  async claim(userId: string, rawCode: string, ipAddress?: string) {
    this.assertEnabled();
    const patient = await this.ownPatient(userId);
    if (!patient) throw new ForbiddenException('Solo una cuenta de paciente puede guardar récipes');
    const prescription = await this.byCode(rawCode);
    if (prescription.patientId === patient.id) return { id: prescription.id, alreadySaved: true };
    if (prescription.status === 'ANNULLED') throw new BadRequestException('Ese récipe fue anulado por el médico');
    if (prescription.patientId) throw new ConflictException('Ese récipe ya está guardado en otra cuenta');
    if (!patient.cedulaLookup || patient.cedulaLookup !== prescription.patientCedulaLookup) {
      throw new ForbiddenException(
        'La cédula del récipe no es la de tu cuenta. Puedes verlo y descargarlo con el código, pero no guardarlo en tu cuenta.',
      );
    }
    const { count } = await this.prisma.prescription.updateMany({
      where: { id: prescription.id, patientId: null },
      data: { patientId: patient.id, deliveredAt: new Date() },
    });
    if (!count) throw new ConflictException('Ese récipe ya está guardado en otra cuenta');
    await this.audit.record({
      userId,
      action: 'PRESCRIPTION_CLAIMED',
      resource: 'Prescription',
      resourceId: prescription.id,
      details: { number: prescription.number },
      ipAddress,
    });
    return { id: prescription.id, alreadySaved: false };
  }

  // --- Público: verificación con el código ----------------------------------

  private async byCode(rawCode: string) {
    const code = normalizeShareCode(rawCode);
    const prescription = code
      ? await this.prisma.prescription.findUnique({
          where: { codeLookup: this.codec.codeLookup(code) },
          include: { professional: { select: { slug: true, isPublished: true } } },
        })
      : null;
    if (!prescription) throw new NotFoundException('No encontramos un récipe con ese código. Revísalo e intenta de nuevo.');
    return prescription;
  }

  /**
   * Lo que ve quien tiene el código (el paciente o la farmacia): el récipe tal
   * como se imprimió, su estado y si la huella coincide. El motivo de una
   * anulación no se muestra.
   */
  async verify(rawCode: string) {
    this.assertEnabled();
    const prescription = await this.byCode(rawCode);
    const { annulReason: _reason, ...view } = this.present(prescription);
    const intact =
      prescriptionHash({
        professionalId: prescription.professionalId,
        number: prescription.number,
        code: this.codec.decodeCode(prescription.codeEnc),
        issuedAt: prescription.issuedAt,
        expiresAt: prescription.expiresAt,
        content: view.content,
      }) === prescription.contentHash;
    return {
      ...view,
      id: undefined,
      intact,
      doctorSlug: prescription.professional.isPublished ? prescription.professional.slug : null,
    };
  }

  async verifyPdf(rawCode: string) {
    this.assertEnabled();
    return this.renderStored(await this.byCode(rawCode));
  }
}
