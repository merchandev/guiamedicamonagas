// Versiones vigentes de los textos legales — deben coincidir con
// backend/src/common/legal-versions.ts. Al cambiar un texto se sube su
// versión en ambos lados y la plataforma vuelve a pedir la aceptación.
export const TERMS_VERSION = '2.2';
export const PRIVACY_VERSION = '2.2';
export const LEGAL_EFFECTIVE_DATE_LABEL = '25 de septiembre de 2026';
export const PATIENT_CONSENT_VERSION = '1.1';

/**
 * Identificación del responsable del tratamiento (Política de privacidad, §1).
 * NO inventar datos: se completa con los datos reales del titular y, al
 * hacerlo, se sube PRIVACY_VERSION aquí y en backend/src/common/legal-versions.ts
 * (la plataforma pedirá aceptar la nueva versión). Mientras falten, la sección
 * no muestra el bloque.
 */
export const DATA_CONTROLLER: {
  legalName: string | null;
  rif: string | null;
  address: string | null;
  privacyEmail: string | null;
  supportEmail: string | null;
} = {
  legalName: null,
  rif: null,
  address: null,
  privacyEmail: null,
  supportEmail: null,
};
