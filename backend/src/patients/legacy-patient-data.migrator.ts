import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EMPTY_HEALTH_DATA, MedicationItem, PatientDataCodec, PatientHealthData } from './patient-data.codec';

interface LegacyRow {
  id: string;
  cedula: string | null;
  phone: string | null;
  birthDate: Date | null;
  sex: string | null;
  bloodType: string | null;
  allergies: string | null;
  emergencyAddress: string | null;
  emergencyMedicalPhone: string | null;
  isHealthy: boolean | null;
  conditionSummary: string | null;
  medications: unknown;
  treatingDoctors: unknown;
}

const LEGACY_TABLE = '"_PatientPlaintextLegacy"';

/**
 * La migración 20260923180000 movió los datos de paciente que estaban en
 * claro a una tabla temporal antes de eliminar sus columnas. Al arrancar,
 * esta clase los cifra con el llavero configurado, los vuelca en la ficha y
 * borra la tabla — el texto plano no sobrevive al primer arranque.
 * Sin tabla (el caso normal) no hace nada.
 */
@Injectable()
export class LegacyPatientDataMigrator implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegacyPatientDataMigrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codec: PatientDataCodec,
  ) {}

  async onApplicationBootstrap() {
    const [{ exists }] = await this.prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT to_regclass('public.${LEGACY_TABLE}') IS NOT NULL AS "exists"`,
    );
    if (!exists) return;

    const rows = await this.prisma.$queryRawUnsafe<(LegacyRow & { userId: string | null })[]>(
      `SELECT l.*, p."userId" FROM ${LEGACY_TABLE} l JOIN "PatientProfile" p ON p."id" = l."id"`,
    );
    let migrated = 0;
    for (const row of rows) {
      const health: PatientHealthData = {
        ...EMPTY_HEALTH_DATA,
        birthDate: row.birthDate ? row.birthDate.toISOString().slice(0, 10) : null,
        sex: row.sex,
        bloodType: row.bloodType,
        allergies: row.allergies,
        emergencyAddress: row.emergencyAddress,
        emergencyMedicalPhone: row.emergencyMedicalPhone,
        isHealthy: row.isHealthy ?? false,
        conditionSummary: row.isHealthy ? null : row.conditionSummary,
        medications: Array.isArray(row.medications) ? (row.medications as MedicationItem[]) : [],
        treatingDoctors: Array.isArray(row.treatingDoctors) ? (row.treatingDoctors as string[]) : [],
      };
      await this.prisma.$transaction([
        this.prisma.patientProfile.update({
          where: { id: row.id },
          data: {
            ...(row.cedula ? this.codec.encodeCedula(row.cedula) : {}),
            // Solo los pacientes con cuenta llevan hash de búsqueda (unicidad).
            ...this.codec.encodePhone(row.phone, !!row.userId),
            healthDataEnc: this.codec.encodeHealth(health),
          },
        }),
        this.prisma.$executeRawUnsafe(`DELETE FROM ${LEGACY_TABLE} WHERE "id" = $1`, row.id),
      ]);
      migrated += 1;
    }
    await this.prisma.$executeRawUnsafe(`DROP TABLE ${LEGACY_TABLE}`);
    this.logger.log(`SEC-05: ${migrated} ficha(s) de paciente cifradas y tabla temporal en claro eliminada`);
  }
}
