import { formatDate } from '@/lib/dates';

export type PrescriptionStatus = 'VALID' | 'EXPIRED' | 'ANNULLED';
export type PrescriptionRequirement = 'VERIFICATION' | 'MPPS' | 'CEDULA' | 'RULES' | 'ESTABLISHMENT' | 'SIGNATURE' | 'SEAL';
export type PadImageKind = 'logo' | 'signature' | 'seal';

export interface PrescriptionItem {
  activeIngredient: string;
  concentration: string;
  pharmaceuticalForm: string;
  route: string;
  dose: string;
  duration: string;
  quantity: string | null;
  brandNames: string | null;
  nonSubstitutable: boolean;
  instructions: string | null;
}

export interface PrescriptionContent {
  prescriber: { fullName: string; cedula: string; mppsNumber: string; colegioNumber: string | null; specialties: string[] };
  establishment: { name: string; address: string; rif: string; phone: string | null };
  place: string;
  patient: { fullName: string; cedula: string | null; birthYear: number; guardian: { fullName: string; cedula: string } | null };
  items: PrescriptionItem[];
  pharmacistNotes: string | null;
  patientInstructions: string | null;
}

/** Lo que ven el médico, el paciente y quien verifica con el código. */
export interface PrescriptionView {
  numberLabel: string;
  code: string;
  verifyUrl: string;
  issuedAt: string;
  expiresAt: string;
  status: PrescriptionStatus;
  annulledAt: string | null;
  fingerprint: string;
  content: PrescriptionContent;
}

export interface DoctorPrescription extends PrescriptionView {
  id: string;
  number: number;
  annulReason: string | null;
  deliveredAt: string | null;
  /** Código del paciente de la plataforma que lo tiene en «Mis récipes». */
  deliveredTo: string | null;
  emailsSent: number;
  emailsLeft: number;
}

export interface PatientPrescription extends PrescriptionView {
  id: string;
  annulReason: string | null;
  doctorSlug: string | null;
}

export interface VerifiedPrescription extends PrescriptionView {
  intact: boolean;
  doctorSlug: string | null;
}

export interface PrescriptionSummary {
  id: string;
  number: number;
  numberLabel: string;
  issuedAt: string;
  expiresAt: string;
  status: PrescriptionStatus;
  patientName: string;
  patientCedula: string | null;
  itemsSummary: string;
  delivered: boolean;
}

export interface PatientPrescriptionSummary {
  id: string;
  numberLabel: string;
  issuedAt: string;
  expiresAt: string;
  status: PrescriptionStatus;
  patientName: string;
  itemsSummary: string;
  doctor: { name: string; slug: string | null };
}

export interface PrescriptionPad {
  prescriber: {
    fullName: string;
    cedula: string;
    mppsNumber: string;
    colegioNumber: string | null;
    specialties: string[];
    verificationStatus: string;
  };
  pad: {
    saved: boolean;
    establishmentName: string | null;
    establishmentAddress: string | null;
    establishmentRif: string | null;
    establishmentPhone: string | null;
    city: string | null;
    defaultValidityDays: number;
    rulesAcceptedAt: string | null;
    lastNumber: number;
    logoUrl: string | null;
    signatureUrl: string | null;
    sealUrl: string | null;
  };
  rulesVersion: string;
  missing: PrescriptionRequirement[];
  canIssue: boolean;
}

/** Paciente con cuenta del directorio del médico (el nombre, solo si autorizó su identidad). */
export interface DirectoryPatient {
  patientId: string;
  patientCode: string;
  name: string | null;
}

export const PRESCRIPTION_STATUS: Record<PrescriptionStatus, { label: string; tone: 'pine' | 'neutral' | 'red' }> = {
  VALID: { label: 'Vigente', tone: 'pine' },
  EXPIRED: { label: 'Vencido', tone: 'neutral' },
  ANNULLED: { label: 'Anulado', tone: 'red' },
};

export const REQUIREMENTS: Record<PrescriptionRequirement, { label: string; href: string }> = {
  VERIFICATION: { label: 'Tener tus documentos 100 % aprobados (perfil verificado)', href: '/dashboard/documentos' },
  MPPS: { label: 'Escribir tu N° de registro MPPS en tu perfil', href: '/dashboard/perfil' },
  CEDULA: { label: 'Escribir tu cédula en tu perfil', href: '/dashboard/perfil' },
  RULES: { label: 'Aceptar las condiciones del récipe digital', href: '/dashboard/recipes/talonario' },
  ESTABLISHMENT: { label: 'Completar el establecimiento: nombre, dirección, RIF y lugar de emisión', href: '/dashboard/recipes/talonario' },
  SIGNATURE: { label: 'Subir tu firma', href: '/dashboard/recipes/talonario' },
  SEAL: { label: 'Subir tu sello', href: '/dashboard/recipes/talonario' },
};

export const PAD_IMAGES: Record<PadImageKind, { title: string; hint: string; required: boolean }> = {
  signature: {
    title: 'Firma',
    hint: 'Firma con tinta oscura sobre una hoja blanca y tómale una foto de frente, con buena luz. Quitamos el fondo para que quede sobre la línea de firma.',
    required: true,
  },
  seal: {
    title: 'Sello',
    hint: 'Estampa tu sello sobre una hoja blanca y tómale una foto de frente. Quitamos el fondo para que quede junto a tu firma.',
    required: true,
  },
  logo: {
    title: 'Logo (opcional)',
    hint: 'Solo el logo de tu consultorio o centro de salud: la norma prohíbe en el récipe nombres, logos o lemas de laboratorios, medicamentos o marcas comerciales.',
    required: false,
  },
};

/** Sugerencias para escribir rápido; el médico puede escribir cualquier otra. */
export const PHARMACEUTICAL_FORMS = [
  'Tabletas',
  'Comprimidos',
  'Cápsulas',
  'Grageas',
  'Jarabe',
  'Suspensión',
  'Solución oral',
  'Gotas orales',
  'Sobres',
  'Crema',
  'Ungüento',
  'Gel',
  'Loción',
  'Solución inyectable',
  'Ampollas',
  'Óvulos',
  'Supositorios',
  'Inhalador',
  'Spray nasal',
  'Colirio',
  'Gotas óticas',
  'Parches',
];

export const ADMINISTRATION_ROUTES = [
  'oral',
  'sublingual',
  'tópica',
  'intramuscular',
  'intravenosa',
  'subcutánea',
  'inhalatoria',
  'nasal',
  'oftálmica',
  'ótica',
  'rectal',
  'vaginal',
  'transdérmica',
];

/** Texto para compartir: el enlace lleva el código después de «#», que no llega a ningún servidor. */
export function prescriptionShareText(view: Pick<PrescriptionView, 'numberLabel' | 'code' | 'verifyUrl' | 'expiresAt' | 'content'>): string {
  return `Récipe N° ${view.numberLabel} de Dr(a). ${view.content.prescriber.fullName}, vigente hasta el ${formatDate(view.expiresAt, {
    dateStyle: 'long',
  })}. Puedes verlo y descargarlo en PDF aquí: ${view.verifyUrl} (código ${view.code}).`;
}

/** Enlace de WhatsApp; con teléfono abre ese chat (58 + número sin el 0), sin él deja elegir el contacto. */
export function whatsappShareLink(text: string, phone?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const target = digits ? (digits.startsWith('58') ? digits : `58${digits.replace(/^0/, '')}`) : '';
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
}

/** «K7Q4M9TXP3WD», «k7q4-m9tx-p3wd» o un enlace con «#…» → «K7Q4-M9TX-P3WD» (o null si no parece un código). */
export function normalizePrescriptionCode(input: string): string | null {
  const raw = input.includes('#') ? input.slice(input.lastIndexOf('#') + 1) : input;
  const code = decodeURIComponent(raw).toUpperCase().replace(/[\s-]/g, '');
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$/.test(code)) return null;
  return code.match(/.{4}/g)!.join('-');
}

export const prescriptionFileName = (numberLabel: string) => `recipe-${numberLabel}.pdf`;
