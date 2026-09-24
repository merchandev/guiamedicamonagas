import { Injectable } from '@nestjs/common';
import { FieldEncryptionService } from '../crypto/field-encryption.service';

/** Contenido de una nota clínica. Solo existe descifrado en memoria. */
export interface ClinicalNoteData {
  chiefComplaint: string | null;
  diagnosis: string | null;
  treatment: string | null;
  medications: { name: string; dose?: string; frequency?: string; duration?: string }[];
  /** Notas privadas del médico: nunca visibles para el paciente. */
  privateNotes: string | null;
}

export const CLINICAL_NOTE_CONTEXT = 'ClinicalNote.clinicalData';

/**
 * Único punto de entrada y salida del contenido clínico. ClinicalNote no tiene
 * columnas en claro (solo `clinicalDataEnc`), así que cualquier módulo futuro de
 * historia clínica tiene que pasar por aquí. La historia clínica sigue sin
 * endpoints ni UI: habilitarla exige además consentimiento del paciente
 * (PatientDataGrant con alcance HEALTH) y auditoría de cada lectura.
 */
@Injectable()
export class ClinicalNoteCodec {
  constructor(private readonly crypto: FieldEncryptionService) {}

  encode(data: ClinicalNoteData): string {
    return this.crypto.encryptJson(data, CLINICAL_NOTE_CONTEXT);
  }

  decode(clinicalDataEnc: string): ClinicalNoteData {
    return this.crypto.decryptJson<ClinicalNoteData>(clinicalDataEnc, CLINICAL_NOTE_CONTEXT)!;
  }
}
