import { createHash } from 'crypto';

/**
 * Un medicamento del récipe. Los campos obligatorios son los del art. 6 de la
 * Resolución 031/2013 del MPPS (reforma de la 028, normas de prescripción y
 * dispensación): principio activo o DCI, concentración, forma farmacéutica,
 * vía de administración, dosis exacta y duración del tratamiento.
 */
export interface PrescriptionItem {
  /** Principio activo o Denominación Común Internacional (DCI). */
  activeIngredient: string;
  concentration: string;
  pharmaceuticalForm: string;
  route: string;
  /** Dosis por unidad posológica exacta de cada administración por día. */
  dose: string;
  duration: string;
  /** Cantidad a dispensar. */
  quantity: string | null;
  /** Equivalentes en marcas comerciales, que se imprimen entre paréntesis (art. 6, num. 11). */
  brandNames: string | null;
  /** «Insustituible» (Ley de Medicamentos, art. 40). */
  nonSubstitutable: boolean;
  /** Indicación adicional para el paciente sobre este medicamento. */
  instructions: string | null;
}

/** Todo lo que se imprime en el récipe. Solo existe descifrado en memoria. */
export interface PrescriptionContent {
  prescriber: {
    fullName: string;
    cedula: string;
    mppsNumber: string;
    colegioNumber: string | null;
    specialties: string[];
  };
  establishment: { name: string; address: string; rif: string; phone: string | null };
  /** Lugar de emisión. */
  place: string;
  patient: {
    fullName: string;
    /** null: menor sin cédula; entonces va la del representante. */
    cedula: string | null;
    birthYear: number;
    guardian: { fullName: string; cedula: string } | null;
  };
  items: PrescriptionItem[];
  /** Advertencias al farmacéutico (cuerpo del récipe, art. 6, num. 9). */
  pharmacistNotes: string | null;
  /** Indicaciones generales al paciente (art. 6, num. 10). */
  patientInstructions: string | null;
}

export const PRESCRIPTION_MAX_ITEMS = 8;

export type PrescriptionDisplayStatus = 'VALID' | 'EXPIRED' | 'ANNULLED';

export function prescriptionDisplayStatus(
  prescription: { status: 'ISSUED' | 'ANNULLED'; expiresAt: Date },
  now = new Date(),
): PrescriptionDisplayStatus {
  if (prescription.status === 'ANNULLED') return 'ANNULLED';
  return prescription.expiresAt.getTime() < now.getTime() ? 'EXPIRED' : 'VALID';
}

/** JSON con las claves ordenadas: el mismo contenido da siempre la misma huella. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Huella del récipe: SHA-256 del contenido y de los datos de su emisión. */
export function prescriptionHash(input: {
  professionalId: string;
  number: number;
  code: string;
  issuedAt: Date;
  expiresAt: Date;
  content: PrescriptionContent;
}): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        professionalId: input.professionalId,
        number: input.number,
        code: input.code,
        issuedAt: input.issuedAt.toISOString(),
        expiresAt: input.expiresAt.toISOString(),
        content: input.content,
      }),
    )
    .digest('hex');
}

/** «3F9A 12C4 77B0»: los primeros 12 caracteres de la huella, para imprimir. */
export function shortFingerprint(hash: string): string {
  return hash
    .slice(0, 12)
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, '$1 ');
}

/** «000123» */
export function prescriptionNumberLabel(number: number): string {
  return String(number).padStart(6, '0');
}

/** «Amoxicilina 500 mg + 2 más», para listas. */
export function itemsSummary(items: PrescriptionItem[]): string {
  if (!items.length) return '';
  const first = `${items[0].activeIngredient} ${items[0].concentration}`.trim();
  return items.length > 1 ? `${first} + ${items.length - 1} más` : first;
}
