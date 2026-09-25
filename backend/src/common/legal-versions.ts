// Versiones vigentes de los textos legales. Deben coincidir con
// frontend/src/lib/legal.ts: al cambiar cualquier texto, se sube su versión
// aquí y allá, y a los usuarios con una versión aceptada anterior se les
// vuelve a pedir la aceptación.
export const TERMS_VERSION = '2.2';
export const PRIVACY_VERSION = '2.2';
export const LEGAL_EFFECTIVE_DATE = '2026-09-25';

/**
 * Texto del consentimiento paciente → médico (ver PatientDataGrant).
 * 1.1: entregar el código de paciente (o su QR) autoriza al médico que lo
 * registre, con los alcances elegidos para el código, durante un año.
 */
export const PATIENT_CONSENT_VERSION = '1.1';
