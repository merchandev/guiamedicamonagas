// Canal de reclamos, denuncias y solicitudes legales. Mismos valores que
// los enums LegalRequestCategory y LegalRequestStatus del backend.

export type LegalRequestCategory =
  | 'PRIVACY_RIGHTS'
  | 'ACCOUNT_DELETION'
  | 'UNAUTHORIZED_ACCESS'
  | 'FALSE_IDENTITY'
  | 'FALSE_CREDENTIAL'
  | 'SUSPENDED_PROFESSIONAL'
  | 'MISLEADING_CONTENT'
  | 'SECURITY'
  | 'BILLING'
  | 'INTELLECTUAL_PROPERTY'
  | 'AUTHORITY_REQUEST'
  | 'REVIEW_ABUSE'
  | 'OTHER';

export type LegalRequestStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';

export const LEGAL_REQUEST_CATEGORIES: { value: LegalRequestCategory; label: string; hint: string }[] = [
  {
    value: 'PRIVACY_RIGHTS',
    label: 'Derechos sobre mis datos (acceso, copia, corrección)',
    hint: 'Indica qué dato quieres ver, corregir o recibir.',
  },
  {
    value: 'ACCOUNT_DELETION',
    label: 'Cierre y eliminación de mi cuenta',
    hint: 'Envíala con la sesión iniciada en la cuenta que quieres cerrar. Antes de eliminar, comprobaremos que eres su titular.',
  },
  {
    value: 'UNAUTHORIZED_ACCESS',
    label: 'Acceso indebido a datos',
    hint: 'Cuenta qué datos crees que se vieron, quién y cuándo, si lo sabes.',
  },
  {
    value: 'FALSE_IDENTITY',
    label: 'Identidad falsa o suplantación',
    hint: 'Indica el perfil o la cuenta y por qué crees que suplanta a alguien.',
  },
  {
    value: 'FALSE_CREDENTIAL',
    label: 'Título o credencial falsa',
    hint: 'Indica el perfil y el dato que consideras falso.',
  },
  {
    value: 'SUSPENDED_PROFESSIONAL',
    label: 'Profesional suspendido o inhabilitado',
    hint: 'Indica el perfil y, si la conoces, la decisión del organismo que lo suspendió.',
  },
  {
    value: 'MISLEADING_CONTENT',
    label: 'Publicidad o contenido engañoso',
    hint: 'Indica la página y la afirmación que consideras engañosa.',
  },
  {
    value: 'SECURITY',
    label: 'Seguridad o vulnerabilidad',
    hint: 'Describe la falla y cómo reproducirla. No incluyas datos de otras personas.',
  },
  {
    value: 'BILLING',
    label: 'Pagos, cobros o reembolsos',
    hint: 'Incluye banco, referencia, fecha y monto del pago.',
  },
  {
    value: 'INTELLECTUAL_PROPERTY',
    label: 'Propiedad intelectual',
    hint: 'Indica la obra o el derecho afectado y la página donde está el contenido.',
  },
  {
    value: 'AUTHORITY_REQUEST',
    label: 'Requerimiento de una autoridad',
    hint: 'Identifica el órgano, el funcionario y el fundamento del requerimiento.',
  },
  {
    value: 'REVIEW_ABUSE',
    label: 'Valoración abusiva o falsa',
    hint: 'Indica la ficha del médico y qué opinión es, y por qué crees que es falsa, ofensiva o revela datos de alguien. También sirve para reclamar por una opinión tuya que retiramos o por una sanción.',
  },
  { value: 'OTHER', label: 'Otra solicitud', hint: 'Cuéntanos en qué podemos ayudarte.' },
];

export const LEGAL_REQUEST_CATEGORY_LABELS = Object.fromEntries(
  LEGAL_REQUEST_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<LegalRequestCategory, string>;

export const LEGAL_REQUEST_STATUS: Record<LegalRequestStatus, { label: string; tone: 'amber' | 'neutral' | 'pine' | 'red' }> = {
  OPEN: { label: 'Recibida', tone: 'amber' },
  IN_REVIEW: { label: 'En revisión', tone: 'neutral' },
  RESOLVED: { label: 'Resuelta', tone: 'pine' },
  REJECTED: { label: 'No procede', tone: 'red' },
};

export function isLegalRequestCategory(value: string | null | undefined): value is LegalRequestCategory {
  return !!value && LEGAL_REQUEST_CATEGORIES.some((c) => c.value === value);
}

/** Lo que el solicitante ve de su propia solicitud. */
export interface LegalRequestSummary {
  ticket: string;
  category: LegalRequestCategory;
  status: LegalRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}
