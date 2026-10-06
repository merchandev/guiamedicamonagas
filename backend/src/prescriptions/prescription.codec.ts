import { Injectable } from '@nestjs/common';
import { FieldEncryptionService } from '../crypto/field-encryption.service';
import type { PrescriptionContent } from './prescription-content';

/** Contextos AAD de los campos cifrados del récipe (también los usa la rotación de claves). */
export const PRESCRIPTION_CONTEXTS = {
  content: 'Prescription.content',
  code: 'Prescription.code',
  annulReason: 'Prescription.annulReason',
  lookupCode: 'prescription.code',
} as const;
const CTX = PRESCRIPTION_CONTEXTS;

/**
 * Único punto de entrada y salida del contenido de un récipe y de su código de
 * verificación. Prescription no tiene columnas en claro con datos del paciente
 * ni de los medicamentos.
 */
@Injectable()
export class PrescriptionCodec {
  constructor(private readonly crypto: FieldEncryptionService) {}

  encodeContent(content: PrescriptionContent): string {
    return this.crypto.encryptJson(content, CTX.content);
  }

  decodeContent(contentEnc: string): PrescriptionContent {
    return this.crypto.decryptJson<PrescriptionContent>(contentEnc, CTX.content)!;
  }

  /** Recibe el código ya normalizado (ver patients/share-code.util.ts). */
  codeLookup(code: string): string {
    return this.crypto.lookupHash(code, CTX.lookupCode);
  }

  encodeCode(code: string) {
    return { codeEnc: this.crypto.encrypt(code, CTX.code), codeLookup: this.codeLookup(code) };
  }

  decodeCode(codeEnc: string): string {
    return this.crypto.decrypt(codeEnc, CTX.code);
  }

  /** El motivo de una anulación puede nombrar un medicamento o una dosis: también va cifrado. */
  encodeAnnulReason(reason: string): string {
    return this.crypto.encrypt(reason, CTX.annulReason);
  }

  decodeAnnulReason(annulReason: string | null): string | null {
    return this.crypto.decryptNullable(annulReason, CTX.annulReason);
  }
}
