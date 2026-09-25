import { DocumentStatus, DocumentType, PlanTier, SocialPlatform, VerificationStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { requiredDocumentsFor } from '../documents/document-requirements';
import { SOCIAL_LINK_LIMITS } from '../subscriptions/plan-tiers';

/**
 * Reglas de publicación del médico (decisión del titular, 2026-09-24):
 * - El perfil aparece en el directorio cuando un administrador aprobó al
 *   menos el 60% de sus documentos requeridos y el médico cargó biografía y
 *   foto de perfil.
 * - La insignia «Verificado» (verificationStatus VERIFIED) sigue exigiendo el
 *   100% de los documentos aprobados.
 * - Profesional Plus y Premium solo se contratan con el 100% aprobado.
 */
export const PUBLICATION_MIN_DOCUMENT_RATIO = 0.6;
export const MIN_BIO_LENGTH = 80;
export const FULL_DOCUMENTS_TIERS: PlanTier[] = ['PROFESSIONAL_PLUS', 'PREMIUM'];

/** «Medicina General» está en el catálogo, pero no convierte al médico en especialista. */
export const GENERAL_MEDICINE_SLUG = 'medicina-general';

interface DocumentSnapshot {
  type: DocumentType;
  status: DocumentStatus;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface DocumentProgress {
  required: number;
  approved: number;
  /** Aprobados necesarios para publicarse (60%, redondeado hacia arriba). */
  minimumToPublish: number;
  anyRejected: boolean;
  missing: DocumentType[];
}

/** Cuenta, por tipo requerido, el documento más reciente aprobado y vigente. */
export function documentProgress(isSpecialist: boolean, documents: DocumentSnapshot[], now = new Date()): DocumentProgress {
  const required = requiredDocumentsFor(isSpecialist);
  const latestByType = new Map<DocumentType, DocumentSnapshot>();
  for (const doc of documents) {
    const current = latestByType.get(doc.type);
    if (!current || doc.createdAt > current.createdAt) latestByType.set(doc.type, doc);
  }

  const missing: DocumentType[] = [];
  let anyRejected = false;
  for (const type of required) {
    const doc = latestByType.get(type);
    if (!doc || doc.status !== 'APPROVED' || (doc.expiresAt && doc.expiresAt < now)) missing.push(type);
    if (doc?.status === 'REJECTED') anyRejected = true;
  }

  return {
    required: required.length,
    approved: required.length - missing.length,
    minimumToPublish: Math.ceil(required.length * PUBLICATION_MIN_DOCUMENT_RATIO),
    anyRejected,
    missing,
  };
}

export function hasCompleteBio(bio: string | null | undefined): boolean {
  return (bio?.trim().length ?? 0) >= MIN_BIO_LENGTH;
}

export interface PublicationInput {
  verificationStatus: VerificationStatus;
  photoUrl: string | null;
  bio: string | null;
  documents: DocumentProgress;
}

export function publicationRequirements(p: PublicationInput) {
  return [
    {
      key: 'documents',
      label: `Al menos ${p.documents.minimumToPublish} de ${p.documents.required} documentos aprobados (60%)`,
      done: p.documents.approved >= p.documents.minimumToPublish,
    },
    { key: 'bio', label: `Biografía profesional (mínimo ${MIN_BIO_LENGTH} caracteres)`, done: hasCompleteBio(p.bio) },
    { key: 'photo', label: 'Foto de perfil', done: !!p.photoUrl },
  ];
}

export function canBePublished(p: PublicationInput): boolean {
  return p.verificationStatus !== 'SUSPENDED' && publicationRequirements(p).every((r) => r.done);
}

/** Profesional Plus y Premium exigen el 100% de los documentos aprobados. */
export function canSubscribeToTier(tier: PlanTier, documents: DocumentProgress): boolean {
  return !FULL_DOCUMENTS_TIERS.includes(tier) || documents.approved === documents.required;
}

export interface ChecklistInput extends PublicationInput {
  isEmailVerified: boolean;
  phone: string | null;
  whatsapp: string | null;
  seoDescription: string | null;
  specialtyCount: number;
  planTier: PlanTier;
  socialPlatforms: SocialPlatform[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** Avance parcial (0–1): solo los documentos lo usan. */
  fraction?: number;
  detail?: string;
  href?: string;
  requiredToPublish?: boolean;
  /** Plan desde el que se habilita; el ítem no cuenta en el porcentaje mientras tanto. */
  lockedUntil?: PlanTier;
}

/**
 * Todo lo que el médico debe completar, en orden, para la barra de progreso
 * del panel. Los ítems que su plan todavía no permite (redes, web) se
 * muestran bloqueados y no restan porcentaje.
 */
export function professionalChecklist(p: ChecklistInput) {
  const socialAllowed = SOCIAL_LINK_LIMITS[p.planTier].allowedPlatforms;
  const hasSocial = p.socialPlatforms.some((platform) => platform !== 'WEBSITE');
  const hasWebsite = p.socialPlatforms.includes('WEBSITE');
  const docs = p.documents;

  const items: ChecklistItem[] = [
    { key: 'account', label: 'Registro de la cuenta', done: true },
    { key: 'email', label: 'Correo electrónico confirmado', done: p.isEmailVerified },
    { key: 'phone', label: 'Número de contacto', done: !!(p.phone || p.whatsapp), href: '/dashboard/perfil' },
    { key: 'photo', label: 'Foto de perfil', done: !!p.photoUrl, href: '/dashboard/perfil', requiredToPublish: true },
    {
      key: 'bio',
      label: `Biografía profesional (mínimo ${MIN_BIO_LENGTH} caracteres)`,
      done: hasCompleteBio(p.bio),
      href: '/dashboard/perfil',
      requiredToPublish: true,
    },
    { key: 'specialties', label: 'Especialidades', done: p.specialtyCount > 0, href: '/dashboard/perfil' },
    { key: 'summary', label: 'Resumen corto (extracto)', done: !!p.seoDescription?.trim(), href: '/dashboard/perfil' },
    {
      key: 'documents',
      label: 'Documentos de verificación',
      done: docs.approved === docs.required,
      fraction: docs.required ? docs.approved / docs.required : 0,
      detail: `${docs.approved} de ${docs.required} aprobados · mínimo ${docs.minimumToPublish} para publicarte y todos para Profesional Plus o Premium`,
      href: '/dashboard/documentos',
      requiredToPublish: true,
    },
    {
      key: 'social',
      label: 'Redes sociales',
      done: hasSocial,
      href: '/dashboard/perfil',
      lockedUntil: socialAllowed.some((platform) => platform !== 'WEBSITE') ? undefined : 'PROFESSIONAL_PLUS',
    },
    {
      key: 'website',
      label: 'Sitio web',
      done: hasWebsite,
      href: '/dashboard/perfil',
      lockedUntil: socialAllowed.includes('WEBSITE') ? undefined : 'PREMIUM',
    },
  ];

  const counted = items.filter((item) => !item.lockedUntil);
  const score = counted.reduce((sum, item) => sum + (item.fraction ?? (item.done ? 1 : 0)), 0);
  return {
    percent: Math.round((score / counted.length) * 100),
    items,
    publication: publicationRequirements(p),
    canPublish: canBePublished(p),
    fullDocuments: docs.approved === docs.required,
    documents: { approved: docs.approved, required: docs.required, minimumToPublish: docs.minimumToPublish },
  };
}

/** VERIFIED solo con el 100% aprobado; un perfil suspendido sigue suspendido. */
export function nextVerificationStatus(current: VerificationStatus, documents: DocumentProgress): VerificationStatus {
  if (current === 'SUSPENDED') return 'SUSPENDED';
  if (documents.approved === documents.required) return 'VERIFIED';
  if (documents.anyRejected) return 'REJECTED';
  return current === 'PENDING' && documents.approved === 0 ? 'PENDING' : 'IN_REVIEW';
}

/**
 * Recalcula verificación y publicación con las reglas de arriba y guarda los
 * cambios. Devuelve las transiciones para que quien llama avise al médico.
 */
export async function recomputeProfessionalStatus(
  prisma: Pick<PrismaService, 'professionalProfile'>,
  professionalId: string,
  now = new Date(),
) {
  const profile = await prisma.professionalProfile.findUnique({
    where: { id: professionalId },
    select: {
      isPublished: true,
      verificationStatus: true,
      isSpecialist: true,
      photoUrl: true,
      bio: true,
      documents: { select: { type: true, status: true, createdAt: true, expiresAt: true } },
    },
  });
  if (!profile) return null;

  const documents = documentProgress(profile.isSpecialist, profile.documents, now);
  const verificationStatus = nextVerificationStatus(profile.verificationStatus, documents);
  const isPublished = canBePublished({ ...profile, verificationStatus, documents });
  const becameVerified = verificationStatus === 'VERIFIED' && profile.verificationStatus !== 'VERIFIED';

  if (verificationStatus !== profile.verificationStatus || isPublished !== profile.isPublished) {
    await prisma.professionalProfile.update({
      where: { id: professionalId },
      data: { verificationStatus, isPublished, ...(becameVerified ? { verifiedAt: now } : {}) },
    });
  }
  return {
    documents,
    verificationStatus,
    isPublished,
    becamePublic: isPublished && !profile.isPublished,
    becameVerified,
  };
}
