import { DocumentStatus, DocumentType, PlanTier, SocialPlatform, TrialNotice, VerificationStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { requiredDocumentsFor } from '../documents/document-requirements';
import {
  PRESENTATION_VIDEO_MIN_TIER,
  SOCIAL_LINK_LIMITS,
  TRIAL_DAYS,
  TRIAL_TIER,
  hasActivePlan,
  tierAtLeast,
} from '../subscriptions/plan-tiers';

/**
 * Reglas de publicación del médico (decisiones del titular, 2026-09-24 y 2026-10-06):
 * - El perfil aparece en el directorio cuando un administrador aprobó al
 *   menos el 60% de sus documentos requeridos, el médico cargó biografía y
 *   foto de perfil y tiene un plan: pagado o la prueba gratuita de Plus.
 * - La prueba gratuita (Plus durante 14 días, una sola vez) empieza sola la
 *   primera vez que el perfil, sin plan, cumple todo eso con el 100% de los
 *   documentos aprobados. Al vencer sin un plan pagado, deja de mostrarse.
 * - La insignia «Verificado» (verificationStatus VERIFIED) sigue exigiendo el
 *   100% de los documentos aprobados.
 * - Plus, Premium y Marca Médica solo se contratan con el 100% aprobado.
 */
export const PUBLICATION_MIN_DOCUMENT_RATIO = 0.6;
export const MIN_BIO_LENGTH = 80;
export const FULL_DOCUMENTS_TIERS: PlanTier[] = ['PROFESSIONAL_PLUS', 'PREMIUM', 'AGENCY'];

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
  /** Plan vigente; FREE = sin plan. */
  planTier: PlanTier;
  /** La prueba gratuita todavía no se usó (ver trialAvailable). */
  trialAvailable?: boolean;
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
    {
      key: 'plan',
      label: p.trialAvailable
        ? `Un plan: tu prueba gratis de ${TRIAL_DAYS} días del plan Plus empieza sola con el 100% de tus documentos aprobados, tu biografía y tu foto (o elige un plan de pago)`
        : 'Un plan activo: elígelo en «Suscripción y pagos»',
      done: hasActivePlan(p.planTier),
    },
  ];
}

export function canBePublished(p: PublicationInput): boolean {
  return p.verificationStatus !== 'SUSPENDED' && publicationRequirements(p).every((r) => r.done);
}

/** La prueba gratuita se usa una sola vez: no la tiene quien ya la empezó ni quien ya pagó un plan. */
export function trialAvailable(p: { trialStartedAt: Date | null; trialNotice: TrialNotice }): boolean {
  return !p.trialStartedAt && p.trialNotice !== 'CLOSED';
}

/** La prueba empieza la primera vez que el perfil, sin plan, puede publicarse con el 100% de los documentos aprobados. */
export function startsTrial(p: PublicationInput): boolean {
  return (
    !!p.trialAvailable &&
    !hasActivePlan(p.planTier) &&
    p.documents.approved === p.documents.required &&
    canBePublished({ ...p, planTier: TRIAL_TIER })
  );
}

/** Plus, Premium y Marca Médica exigen el 100% de los documentos aprobados. */
export function canSubscribeToTier(tier: PlanTier, documents: DocumentProgress): boolean {
  return !FULL_DOCUMENTS_TIERS.includes(tier) || documents.approved === documents.required;
}

export interface ChecklistInput extends PublicationInput {
  isEmailVerified: boolean;
  phone: string | null;
  whatsapp: string | null;
  seoDescription: string | null;
  specialtyCount: number;
  socialPlatforms: SocialPlatform[];
  presentationVideoId?: string | null;
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
 * del panel. Los ítems que su plan todavía no permite (redes, web, video) se
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
      detail: `${docs.approved} de ${docs.required} aprobados · ${
        p.trialAvailable ? 'todos para tu prueba gratis de Plus; ' : ''
      }mínimo ${docs.minimumToPublish} para publicarte con el plan Profesional y todos para Plus, Premium o Marca Médica`,
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
    {
      key: 'video',
      label: 'Video de presentación',
      done: !!p.presentationVideoId,
      href: '/dashboard/perfil',
      lockedUntil: tierAtLeast(p.planTier, PRESENTATION_VIDEO_MIN_TIER) ? undefined : PRESENTATION_VIDEO_MIN_TIER,
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
 * cambios; si corresponde, empieza la prueba gratuita de Plus. Devuelve las
 * transiciones para que quien llama avise al médico.
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
      user: { select: { isActive: true } },
      verificationStatus: true,
      isSpecialist: true,
      photoUrl: true,
      bio: true,
      planTier: true,
      trialStartedAt: true,
      trialNotice: true,
      documents: { select: { type: true, status: true, createdAt: true, expiresAt: true } },
    },
  });
  if (!profile) return null;

  const documents = documentProgress(profile.isSpecialist, profile.documents, now);
  const verificationStatus = nextVerificationStatus(profile.verificationStatus, documents);
  const input = { ...profile, verificationStatus, documents, trialAvailable: trialAvailable(profile) };
  // Una cuenta suspendida o dada de baja no empieza la prueba.
  const trialStarted = profile.user.isActive && startsTrial(input);
  const planTier = trialStarted ? TRIAL_TIER : profile.planTier;
  const trialEndsAt = trialStarted ? new Date(now.getTime() + TRIAL_DAYS * 86_400_000) : null;
  const isPublished = profile.user.isActive && canBePublished({ ...input, planTier });
  const becameVerified = verificationStatus === 'VERIFIED' && profile.verificationStatus !== 'VERIFIED';

  if (verificationStatus !== profile.verificationStatus || isPublished !== profile.isPublished || trialStarted) {
    const changed = await prisma.professionalProfile.updateMany({
      // El plan también: un pago aprobado al mismo tiempo no se pisa con la prueba.
      where: { id: professionalId, verificationStatus: profile.verificationStatus, planTier: profile.planTier,
        user: { isActive: profile.user.isActive } },
      data: {
        verificationStatus,
        isPublished,
        ...(becameVerified ? { verifiedAt: now } : {}),
        ...(trialStarted ? { planTier, trialStartedAt: now, trialEndsAt } : {}),
      },
    });
    // Una moderación o un pago concurrente tiene prioridad sobre este cálculo anterior.
    if (changed.count === 0) return null;
  }
  return {
    documents,
    verificationStatus,
    isPublished,
    becamePublic: isPublished && !profile.isPublished,
    becameVerified,
    trialStarted,
    trialEndsAt,
  };
}
