import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Acepta tanto el cliente Prisma normal como el cliente de una transacción (`tx`). */
type PatientCodeClient = Pick<PrismaService, 'patientProfile'>;

/** Genera un código único "GMM-XXXX" para una nueva ficha de paciente. */
export async function generatePatientCode(prisma: PatientCodeClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `GMM-${randomBytes(2).toString('hex').toUpperCase()}`;
    const exists = await prisma.patientProfile.findUnique({ where: { patientCode: code } });
    if (!exists) return code;
  }
  throw new Error('No se pudo generar un código de paciente único');
}
