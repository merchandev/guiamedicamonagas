import { Injectable } from '@nestjs/common';
import type { PatientProfile } from '@prisma/client';
import {
  FieldEncryptionService,
  formatCedula,
  formatPhone,
  normalizeCedula,
  normalizePhone,
} from '../crypto/field-encryption.service';

export interface MedicationItem {
  name: string;
  schedule: string;
}

/** Todo lo que viaja cifrado en PatientProfile.healthDataEnc. */
export interface PatientHealthData {
  birthDate: string | null;
  sex: string | null;
  bloodType: string | null;
  allergies: string | null;
  emergencyAddress: string | null;
  emergencyMedicalPhone: string | null;
  isHealthy: boolean;
  conditionSummary: string | null;
  medications: MedicationItem[];
  treatingDoctors: string[];
}

export const EMPTY_HEALTH_DATA: PatientHealthData = {
  birthDate: null,
  sex: null,
  bloodType: null,
  allergies: null,
  emergencyAddress: null,
  emergencyMedicalPhone: null,
  isHealthy: false,
  conditionSummary: null,
  medications: [],
  treatingDoctors: [],
};

/** Contextos AAD de cada campo cifrado (también los usa la rotación de claves). */
export const PATIENT_DATA_CONTEXTS = {
  cedula: 'PatientProfile.cedula',
  phone: 'PatientProfile.phone',
  health: 'PatientProfile.healthData',
  lookupCedula: 'patient.cedula',
  lookupPhone: 'patient.phone',
  appointmentReason: 'Appointment.reason',
} as const;
const CTX = PATIENT_DATA_CONTEXTS;

const ENCRYPTED_PREFIX = 'gmm1.';

export type DecodedPatient = Omit<PatientProfile, 'cedulaEnc' | 'cedulaLookup' | 'phoneEnc' | 'phoneLookup' | 'healthDataEnc'> & {
  cedula: string | null;
  phone: string | null;
} & PatientHealthData;

/** Punto único donde los datos del paciente entran y salen del cifrado. */
@Injectable()
export class PatientDataCodec {
  constructor(private readonly crypto: FieldEncryptionService) {}

  cedulaLookup(cedula: string): string {
    return this.crypto.lookupHash(normalizeCedula(cedula), CTX.lookupCedula);
  }

  phoneLookup(phone: string): string {
    return this.crypto.lookupHash(normalizePhone(phone), CTX.lookupPhone);
  }

  encodeCedula(cedula: string) {
    return {
      cedulaEnc: this.crypto.encrypt(formatCedula(cedula), CTX.cedula),
      cedulaLookup: this.cedulaLookup(cedula),
    };
  }

  /**
   * `unique` = false para fichas walk-in: el teléfono queda cifrado pero sin
   * hash de búsqueda, así no choca (ni revela) el de un paciente con cuenta.
   */
  encodePhone(phone: string | null | undefined, unique = true) {
    if (!phone) return { phoneEnc: null, phoneLookup: null };
    return {
      phoneEnc: this.crypto.encrypt(formatPhone(phone), CTX.phone),
      phoneLookup: unique ? this.phoneLookup(phone) : null,
    };
  }

  encodeHealth(data: PatientHealthData): string {
    return this.crypto.encryptJson(data, CTX.health);
  }

  decodeHealth(profile: Pick<PatientProfile, 'healthDataEnc'>): PatientHealthData {
    const stored = this.crypto.decryptJson<Partial<PatientHealthData>>(profile.healthDataEnc, CTX.health);
    return { ...EMPTY_HEALTH_DATA, ...(stored ?? {}) };
  }

  decode(profile: PatientProfile): DecodedPatient {
    const { cedulaEnc, cedulaLookup: _cl, phoneEnc, phoneLookup: _pl, healthDataEnc, ...rest } = profile;
    return {
      ...rest,
      cedula: this.crypto.decryptNullable(cedulaEnc, CTX.cedula),
      phone: this.crypto.decryptNullable(phoneEnc, CTX.phone),
      ...this.decodeHealth({ healthDataEnc }),
    };
  }

  decodePhone(profile: Pick<PatientProfile, 'phoneEnc'>): string | null {
    return this.crypto.decryptNullable(profile.phoneEnc, CTX.phone);
  }

  /** El motivo de consulta también es dato de salud. */
  encodeAppointmentReason(reason: string | null | undefined): string | null {
    return this.crypto.encryptNullable(reason, CTX.appointmentReason);
  }

  /** Tolera filas antiguas en claro (anteriores al cifrado). */
  decodeAppointmentReason(reason: string | null | undefined): string | null {
    if (!reason) return null;
    return reason.startsWith(ENCRYPTED_PREFIX) ? this.crypto.decrypt(reason, CTX.appointmentReason) : reason;
  }
}
