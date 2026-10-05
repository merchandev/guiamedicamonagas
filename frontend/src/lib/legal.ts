// Versiones vigentes de los textos legales — deben coincidir con
// backend/src/common/legal-versions.ts. Al cambiar un texto se sube su
// versión en ambos lados y la plataforma vuelve a pedir la aceptación.

/** Documentos cuya aceptación queda registrada en el servidor (LegalAcceptance). */
export type LegalDocumentKey =
  | 'TERMS'
  | 'PRIVACY'
  | 'PROFESSIONAL_TERMS'
  | 'PATIENT_HEALTH_CONSENT'
  | 'AGE_DECLARATION';

export const LEGAL_VERSIONS: Record<LegalDocumentKey, string> = {
  TERMS: '3.0',
  PRIVACY: '3.0',
  PROFESSIONAL_TERMS: '1.0',
  PATIENT_HEALTH_CONSENT: '1.0',
  AGE_DECLARATION: '1.0',
};

export const TERMS_VERSION = LEGAL_VERSIONS.TERMS;
export const PRIVACY_VERSION = LEGAL_VERSIONS.PRIVACY;
export const LEGAL_EFFECTIVE_DATE_LABEL = '30 de septiembre de 2026';
/** Texto de la autorización paciente → médico (/privacidad/autorizacion-medica). */
export const PATIENT_CONSENT_VERSION = '2.0';

export const SITE_DOMAIN = 'guiamedicamonagas.com';

/**
 * Identificación del operador y responsable del tratamiento (Aviso legal).
 * NO inventar datos: se completa con los datos reales del titular y, al
 * hacerlo, se sube PRIVACY_VERSION aquí y en backend/src/common/legal-versions.ts
 * (la plataforma pedirá aceptar la nueva versión). Mientras falten, el Aviso
 * legal los muestra como «pendiente de publicación» y el resto de páginas
 * remite al canal de solicitudes en lugar de a un correo.
 */
export const DATA_CONTROLLER: {
  legalName: string | null;
  rif: string | null;
  address: string | null;
  /** Persona responsable del tratamiento de datos. */
  responsibleName: string | null;
  legalEmail: string | null;
  privacyEmail: string | null;
  supportEmail: string | null;
  securityEmail: string | null;
} = {
  legalName: null,
  rif: null,
  address: null,
  responsibleName: null,
  legalEmail: null,
  privacyEmail: null,
  supportEmail: null,
  securityEmail: null,
};

export type LegalDocSlug =
  | 'aviso-legal'
  | 'terminos'
  | 'privacidad'
  | 'datos-de-salud'
  | 'consentimiento-paciente'
  | 'autorizacion-medica'
  | 'descargo-medico'
  | 'verificacion'
  | 'condiciones-profesionales'
  | 'cookies'
  | 'pagos'
  | 'reembolsos'
  | 'retencion'
  | 'publicidad-medica'
  | 'uso-aceptable'
  | 'seguridad'
  | 'derechos'
  | 'menores'
  | 'proveedores'
  | 'reclamos'
  | 'propiedad-intelectual';

export type LegalDocGroup = 'general' | 'privacidad' | 'salud' | 'profesionales' | 'seguridad';

export interface LegalDoc {
  slug: LegalDocSlug;
  href: string;
  title: string;
  /** Nombre corto para menús y enlaces. */
  short: string;
  version: string;
  group: LegalDocGroup;
  summary: string;
}

export const LEGAL_GROUP_LABELS: Record<LegalDocGroup, string> = {
  general: 'Condiciones generales',
  privacidad: 'Privacidad y datos personales',
  salud: 'Salud y responsabilidad médica',
  profesionales: 'Profesionales, planes y pagos',
  seguridad: 'Seguridad y reclamos',
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: 'aviso-legal',
    href: '/aviso-legal',
    title: 'Aviso legal e identificación del operador',
    short: 'Aviso legal',
    version: '1.0',
    group: 'general',
    summary: 'Quién opera la plataforma, cómo contactarlo y a qué normas venezolanas se ajusta.',
  },
  {
    slug: 'terminos',
    href: '/terminos-y-condiciones',
    title: 'Términos y condiciones generales',
    short: 'Términos y condiciones',
    version: LEGAL_VERSIONS.TERMS,
    group: 'general',
    summary: 'Qué es y qué no es Guía Médica Monagas, las reglas de las cuentas y los límites de responsabilidad.',
  },
  {
    slug: 'propiedad-intelectual',
    href: '/propiedad-intelectual',
    title: 'Propiedad intelectual y contenido de los usuarios',
    short: 'Propiedad intelectual',
    version: '1.1',
    group: 'general',
    summary: 'Derechos sobre la marca y el software, y la licencia limitada sobre lo que cada usuario publica.',
  },
  {
    slug: 'privacidad',
    href: '/privacidad',
    title: 'Política de privacidad y protección de datos',
    short: 'Política de privacidad',
    version: LEGAL_VERSIONS.PRIVACY,
    group: 'privacidad',
    summary: 'Qué datos tratamos, para qué, quién puede verlos y cuáles son tus derechos.',
  },
  {
    slug: 'datos-de-salud',
    href: '/privacidad/datos-de-salud',
    title: 'Política de datos de salud y datos sensibles',
    short: 'Datos de salud',
    version: '1.0',
    group: 'privacidad',
    summary: 'Reglas reforzadas para la información de salud: privada, cifrada, sin venta, sin publicidad y sin IA.',
  },
  {
    slug: 'consentimiento-paciente',
    href: '/consentimiento-paciente',
    title: 'Consentimiento del paciente para el tratamiento de sus datos',
    short: 'Consentimiento del paciente',
    version: LEGAL_VERSIONS.PATIENT_HEALTH_CONSENT,
    group: 'privacidad',
    summary: 'El texto que aceptas al crear tu perfil de paciente y la evidencia que queda de esa aceptación.',
  },
  {
    slug: 'autorizacion-medica',
    href: '/privacidad/autorizacion-medica',
    title: 'Autorización de acceso médico mediante código o QR',
    short: 'Autorización por código o QR',
    version: PATIENT_CONSENT_VERSION,
    group: 'privacidad',
    summary: 'Cómo autorizas a un médico a ver tus datos, con qué alcance, por cuánto tiempo y cómo lo revocas.',
  },
  {
    slug: 'derechos',
    href: '/privacidad/derechos',
    title: 'Centro de privacidad y ejercicio de derechos',
    short: 'Centro de privacidad',
    version: '1.0',
    group: 'privacidad',
    summary: 'Ver, corregir y descargar tus datos, consultar accesos, revocar permisos y pedir el cierre de tu cuenta.',
  },
  {
    slug: 'retencion',
    href: '/privacidad/retencion',
    title: 'Política de retención y eliminación de datos',
    short: 'Retención y eliminación',
    version: '1.0',
    group: 'privacidad',
    summary: 'Cuánto tiempo se conserva cada tipo de dato y qué ocurre cuando se elimina una cuenta.',
  },
  {
    slug: 'proveedores',
    href: '/privacidad/proveedores',
    title: 'Política de proveedores y transferencias de datos',
    short: 'Proveedores y transferencias',
    version: '1.1',
    group: 'privacidad',
    summary: 'Qué categorías de proveedores técnicos intervienen, con qué datos y bajo qué límites.',
  },
  {
    slug: 'cookies',
    href: '/cookies',
    title: 'Política de cookies',
    short: 'Política de cookies',
    version: '1.1',
    group: 'privacidad',
    summary: 'Las cookies y el almacenamiento local que usa el sitio, y cómo cambiar tu elección.',
  },
  {
    slug: 'menores',
    href: '/menores',
    title: 'Política de edad y menores',
    short: 'Edad y menores',
    version: LEGAL_VERSIONS.AGE_DECLARATION,
    group: 'privacidad',
    summary: 'El registro de pacientes es solo para mayores de 18 años.',
  },
  {
    slug: 'descargo-medico',
    href: '/descargo-medico',
    title: 'Descargo de responsabilidad médica',
    short: 'Descargo médico',
    version: '1.0',
    group: 'salud',
    summary: 'La plataforma es un directorio tecnológico: no atiende, no diagnostica, no prescribe y no es para emergencias.',
  },
  {
    slug: 'publicidad-medica',
    href: '/publicidad-medica',
    title: 'Política de publicidad y contenido médico',
    short: 'Publicidad médica',
    version: '1.0',
    group: 'salud',
    summary: 'Qué no puede afirmar un perfil y cómo se señalan los espacios destacados.',
  },
  {
    slug: 'verificacion',
    href: '/verificacion-profesionales',
    title: 'Política de verificación de profesionales',
    short: 'Verificación de profesionales',
    version: '1.0',
    group: 'profesionales',
    summary: 'Qué significa «verificado», qué documentos se revisan y qué no garantiza la verificación.',
  },
  {
    slug: 'condiciones-profesionales',
    href: '/profesionales/condiciones',
    title: 'Condiciones específicas para profesionales',
    short: 'Condiciones para profesionales',
    version: LEGAL_VERSIONS.PROFESSIONAL_TERMS,
    group: 'profesionales',
    summary: 'Declaraciones, deberes de confidencialidad y responsabilidad profesional de quien publica un perfil.',
  },
  {
    slug: 'pagos',
    href: '/pagos-y-suscripciones',
    title: 'Política de pagos, planes y suscripciones',
    short: 'Pagos y suscripciones',
    version: '1.1',
    group: 'profesionales',
    summary: 'Planes, moneda, forma de pago, activación, vencimiento y cambios de plan.',
  },
  {
    slug: 'reembolsos',
    href: '/reembolsos',
    title: 'Política de cancelación, reembolsos y devoluciones',
    short: 'Cancelación y reembolsos',
    version: '1.0',
    group: 'profesionales',
    summary: 'Cómo se trata un pago duplicado, un pago no aplicado, una cancelación voluntaria y otros casos.',
  },
  {
    slug: 'uso-aceptable',
    href: '/seguridad/uso-aceptable',
    title: 'Política de seguridad y uso aceptable',
    short: 'Uso aceptable',
    version: '1.0',
    group: 'seguridad',
    summary: 'Conductas prohibidas: accesos indebidos, extracción masiva, suplantación, fraude y acoso.',
  },
  {
    slug: 'seguridad',
    href: '/seguridad',
    title: 'Seguridad y reporte de vulnerabilidades',
    short: 'Seguridad',
    version: '1.0',
    group: 'seguridad',
    summary: 'Cómo protegemos la plataforma y cómo avisarnos de una falla de seguridad.',
  },
  {
    slug: 'reclamos',
    href: '/reclamos',
    title: 'Canal de reclamos, denuncias y solicitudes legales',
    short: 'Reclamos y denuncias',
    version: '1.0',
    group: 'seguridad',
    summary: 'Formulario con número de seguimiento para reclamos, denuncias y solicitudes sobre tus datos.',
  },
];

export function legalDoc(slug: LegalDocSlug): LegalDoc {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  if (!doc) throw new Error(`Documento legal desconocido: ${slug}`);
  return doc;
}

/**
 * Lo que cada cuenta acepta de forma expresa. El texto de la casilla es la
 * declaración que el usuario marca; el servidor guarda documento, versión,
 * fecha y contexto de cada aceptación.
 */
export const ACCEPTANCE_DOCUMENTS: Record<LegalDocumentKey, { docs: LegalDocSlug[]; statement: string }> = {
  TERMS: {
    docs: ['terminos', 'descargo-medico'],
    statement:
      'Acepto los Términos y condiciones y entiendo que Guía Médica Monagas es un directorio tecnológico: no presta atención médica ni de emergencia.',
  },
  PRIVACY: {
    docs: ['privacidad'],
    statement: 'He leído la Política de privacidad y acepto el tratamiento de mis datos para operar mi cuenta.',
  },
  PATIENT_HEALTH_CONSENT: {
    docs: ['consentimiento-paciente', 'datos-de-salud'],
    statement:
      'Doy mi consentimiento expreso para que se almacenen y protejan los datos de salud que yo registre, en los términos del Consentimiento del paciente.',
  },
  AGE_DECLARATION: {
    docs: ['menores'],
    statement: 'Declaro que tengo 18 años o más.',
  },
  PROFESSIONAL_TERMS: {
    docs: ['condiciones-profesionales', 'verificacion', 'publicidad-medica'],
    statement:
      'Acepto las Condiciones para profesionales: mis credenciales son auténticas y guardaré el secreto profesional sobre los datos de los pacientes.',
  },
};

/** Orden en que se muestran las casillas. */
export const ACCEPTANCE_ORDER: LegalDocumentKey[] = [
  'TERMS',
  'PRIVACY',
  'PATIENT_HEALTH_CONSENT',
  'AGE_DECLARATION',
  'PROFESSIONAL_TERMS',
];

/** Documentos que cada tipo de cuenta acepta al registrarse (igual que el backend). */
export function requiredLegalDocuments(role: 'USER' | 'PROFESSIONAL' | 'ORGANIZATION' | 'ADMIN' | 'SUPERADMIN'): LegalDocumentKey[] {
  if (role === 'USER') return ['TERMS', 'PRIVACY', 'PATIENT_HEALTH_CONSENT', 'AGE_DECLARATION'];
  if (role === 'PROFESSIONAL') return ['TERMS', 'PRIVACY', 'PROFESSIONAL_TERMS'];
  return ['TERMS', 'PRIVACY'];
}

// ---------------------------------------------------------------------------
// Avisos breves que se repiten en el sitio. Un solo texto para todas las
// pantallas: si cambia aquí, cambia en todas.
// ---------------------------------------------------------------------------

/** Perfiles, directorio, reserva y pie de página. */
export const MEDICAL_DISCLAIMER_NOTICE =
  'Guía Médica Monagas es un directorio tecnológico. No presta atención médica, veterinaria, estética ni de emergencia; no diagnostica, prescribe ni recomienda tratamientos y no vende medicamentos, alimentos o productos sanitarios.';

export const EMERGENCY_NOTICE =
  'Este sitio no es un servicio de emergencias. Ante una urgencia, acude al centro de salud más cercano o llama a los servicios de emergencia de tu localidad.';

/** Área privada del paciente. */
export const PATIENT_AREA_NOTICE =
  'Tu información privada se utiliza exclusivamente para operar y proteger las funciones de Guía Médica Monagas. No vendemos tus datos, no los usamos para estudiar tus hábitos de consumo y no utilizamos tu información privada o de salud para entrenar modelos de lenguaje o inteligencia artificial. El acceso de un profesional requiere tu autorización cuando corresponda.';

/** Pantalla del código y QR del paciente. */
export const SHARE_CODE_NOTICE =
  'Compartir este QR o código permite que un médico inicie el acceso a tu información privada. Verifica al profesional, el alcance y la duración antes de entregarlo. Puedes revocar una autorización vigente desde tu cuenta.';

/**
 * Reglas que acepta el paciente al enviar una valoración. Si cambian, se sube
 * REVIEW_RULES_VERSION aquí y en backend/src/common/legal-versions.ts.
 */
export const REVIEW_RULES_VERSION = '1.0';
export const REVIEW_RULES: string[] = [
  'Es tu opinión sobre la atención que recibiste: el trato, la puntualidad, la claridad de las explicaciones y el lugar de consulta.',
  'No incluyas datos de salud tuyos ni de otras personas (diagnósticos, tratamientos o medicamentos), ni teléfonos, correos, enlaces o números de cédula.',
  'Sin insultos ni acusaciones que no puedas sostener.',
  'Si solo eliges las estrellas, tu valoración se publica al enviarla. Si escribes un comentario, el equipo de Guía Médica Monagas lo revisa antes de publicarlo y puede rechazarlo si incumple estas reglas.',
  'Se publica como «Paciente verificado», salvo que elijas mostrar tu nombre y la inicial de tu apellido. Nunca se muestran tu cédula, tu código, tu foto ni la fecha exacta de tu consulta: solo el mes y el año.',
];

/** Junto a las valoraciones de una ficha. */
export const REVIEWS_PUBLIC_NOTICE =
  'Son opiniones de pacientes con la identidad verificada y una consulta verificada con este médico. No son una recomendación de Guía Médica Monagas.';

/** Al responder una valoración. */
export const REVIEW_REPLY_NOTICE =
  'Tu respuesta es pública y el equipo la revisa antes de publicarla. Por el secreto médico, no reveles nada clínico del paciente ni datos que permitan identificarlo.';

/** Perfil público del profesional. */
export const VERIFICATION_NOTICE =
  'La verificación indica que Guía Médica Monagas realizó las comprobaciones documentales definidas en su Política de verificación. No constituye una recomendación clínica, certificación estatal adicional, garantía de calidad asistencial ni garantía de resultados.';

/** Lo que la plataforma NO hace (Términos y Descargo médico). */
export const NOT_PROVIDED_SERVICES: string[] = [
  'consultas médicas, presenciales, a domicilio o por telemedicina',
  'atención de urgencias o emergencias',
  'diagnósticos, pronósticos o segundas opiniones',
  'prescripciones, recetas o indicaciones de tratamiento',
  'interpretación de síntomas o de exámenes',
  'consejos médicos, nutricionales, farmacológicos, veterinarios o estéticos',
  'servicios odontológicos, psicológicos, psiquiátricos, de enfermería, veterinarios o estéticos',
  'venta, dispensación, fabricación o distribución de medicamentos',
  'venta de alimentos, suplementos, dispositivos médicos, cosméticos o productos sanitarios',
  'servicios de entrega a domicilio (delivery)',
  'operación de farmacias, laboratorios o clínicas',
];

/** Compromisos sobre los datos privados que se repiten en varias políticas. */
export const DATA_COMMITMENTS: string[] = [
  'No vendemos, alquilamos, licenciamos ni comercializamos datos personales ni de salud.',
  'No entregamos datos de pacientes a anunciantes, aseguradoras, farmacias, laboratorios ni otros terceros con fines comerciales.',
  'No usamos información de salud para publicidad ni para crear perfiles comerciales.',
  'No usamos los datos privados para estudiar hábitos de consumo de medicamentos, alimentos, tratamientos, seguros o servicios.',
  'No usamos datos personales o de salud privados, documentos, fotografías ni archivos de los usuarios para entrenar modelos de lenguaje o de inteligencia artificial, ni los entregamos a terceros con ese fin.',
];
