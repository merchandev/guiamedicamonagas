import type { LegalDocument, Role } from '@prisma/client';

// Versiones vigentes de los textos legales. Deben coincidir con
// frontend/src/lib/legal.ts: al cambiar cualquier texto se sube su versión
// aquí y allá, y a quien tenga aceptada una versión anterior se le vuelve a
// pedir la aceptación. Cada aceptación queda en LegalAcceptance.
export const LEGAL_VERSIONS: Record<LegalDocument, string> = {
  TERMS: '3.0',
  PRIVACY: '3.0',
  PROFESSIONAL_TERMS: '1.0',
  PATIENT_HEALTH_CONSENT: '1.0',
  AGE_DECLARATION: '1.0',
};

export const LEGAL_DOCUMENT_TITLES: Record<LegalDocument, string> = {
  TERMS: 'los Términos y condiciones',
  PRIVACY: 'la Política de privacidad',
  PROFESSIONAL_TERMS: 'las Condiciones para profesionales',
  PATIENT_HEALTH_CONSENT: 'el Consentimiento para el tratamiento de tus datos de salud',
  AGE_DECLARATION: 'la declaración de mayoría de edad',
};

export const TERMS_VERSION = LEGAL_VERSIONS.TERMS;
export const PRIVACY_VERSION = LEGAL_VERSIONS.PRIVACY;
export const LEGAL_EFFECTIVE_DATE = '2026-09-30';

/** Qué debe aceptar cada tipo de cuenta para usar la plataforma. */
export function requiredLegalDocuments(role: Role): LegalDocument[] {
  if (role === 'USER') return ['TERMS', 'PRIVACY', 'PATIENT_HEALTH_CONSENT', 'AGE_DECLARATION'];
  if (role === 'PROFESSIONAL') return ['TERMS', 'PRIVACY', 'PROFESSIONAL_TERMS'];
  return ['TERMS', 'PRIVACY'];
}

/**
 * Texto de la autorización paciente → médico (ver PatientDataGrant y
 * /privacidad/autorizacion-medica). 2.0: la autorización por código o QR
 * tiene alcance y vencimiento, es revocable al instante y cada acceso queda
 * en el historial que ve el paciente.
 */
export const PATIENT_CONSENT_VERSION = '2.0';

/**
 * Reglas que acepta el paciente al enviar una valoración (frontend/src/lib/legal.ts,
 * REVIEW_RULES): queda guardada en cada valoración.
 */
export const REVIEW_RULES_VERSION = '1.0';
