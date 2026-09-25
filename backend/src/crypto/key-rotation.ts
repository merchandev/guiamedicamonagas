import { FieldEncryptionService } from './field-encryption.service';
import { PATIENT_DATA_CONTEXTS } from '../patients/patient-data.codec';
import { CLINICAL_NOTE_CONTEXT } from '../clinical/clinical-note.codec';

/**
 * Todos los campos cifrados con FieldEncryptionService y su contexto AAD. Un
 * campo cifrado nuevo debe agregarse aquí o la rotación lo dejaría con la
 * clave vieja (y retirar esa clave lo volvería ilegible).
 */
export const ENCRYPTED_FIELDS = [
  { model: 'patientProfile', field: 'cedulaEnc', context: PATIENT_DATA_CONTEXTS.cedula },
  { model: 'patientProfile', field: 'phoneEnc', context: PATIENT_DATA_CONTEXTS.phone },
  { model: 'patientProfile', field: 'healthDataEnc', context: PATIENT_DATA_CONTEXTS.health },
  { model: 'patientProfile', field: 'shareCodeEnc', context: PATIENT_DATA_CONTEXTS.shareCode },
  { model: 'appointment', field: 'reason', context: PATIENT_DATA_CONTEXTS.appointmentReason },
  { model: 'clinicalNote', field: 'clinicalDataEnc', context: CLINICAL_NOTE_CONTEXT },
] as const;

export const ENCRYPTED_VALUE_PREFIX = 'gmm1.';

/**
 * Si `payload` está cifrado con una clave que ya no es la activa, lo descifra
 * y lo vuelve a cifrar con la activa. Devuelve null si no hay nada que hacer
 * (ya usa la clave activa, o no es un valor cifrado, p. ej. un motivo de
 * consulta anterior al cifrado).
 */
export function reencryptIfStale(crypto: FieldEncryptionService, payload: string | null, context: string): string | null {
  if (!payload || !payload.startsWith(ENCRYPTED_VALUE_PREFIX) || !crypto.needsRotation(payload)) return null;
  return crypto.encrypt(crypto.decrypt(payload, context), context);
}
