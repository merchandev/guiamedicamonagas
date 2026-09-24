/**
 * Rotación de claves de cifrado (paso 4 del procedimiento de
 * docs/security/sec-02-05-privacidad-y-acceso.md): re-cifra con
 * DATA_ENCRYPTION_ACTIVE_KEY todo valor cifrado con una clave anterior.
 *
 * Se ejecuta dentro del contenedor `api`, con las claves de su entorno:
 *
 *   node dist/src/scripts/rotate-encryption-keys.js           # simulación: solo cuenta
 *   node dist/src/scripts/rotate-encryption-keys.js --apply   # re-cifra
 *
 * Cada escritura exige que el valor no haya cambiado desde que se leyó, así
 * que puede correr con la aplicación en marcha. Es idempotente: una segunda
 * pasada no encuentra nada. Nunca imprime datos, solo conteos.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { FieldEncryptionService, parseKeyring } from '../crypto/field-encryption.service';
import { ENCRYPTED_FIELDS, ENCRYPTED_VALUE_PREFIX, reencryptIfStale } from '../crypto/key-rotation';

const BATCH = 200;

async function main() {
  const apply = process.argv.includes('--apply');
  const crypto = FieldEncryptionService.fromKeyring(
    parseKeyring(
      process.env.DATA_ENCRYPTION_KEYS ?? '',
      process.env.DATA_ENCRYPTION_ACTIVE_KEY ?? 'v1',
      process.env.DATA_LOOKUP_KEY ?? '',
    ),
  );
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
  let failures = 0;

  try {
    for (const { model, field, context } of ENCRYPTED_FIELDS) {
      const delegate = (prisma as unknown as Record<string, any>)[model];
      const counts = { encrypted: 0, stale: 0, rotated: 0, changedMeanwhile: 0, failed: 0 };
      let cursor: string | undefined;

      for (;;) {
        const rows: { id: string; value: string | null }[] = (
          await delegate.findMany({
            where: { [field]: { startsWith: ENCRYPTED_VALUE_PREFIX } },
            select: { id: true, [field]: true },
            orderBy: { id: 'asc' },
            take: BATCH,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          })
        ).map((row: Record<string, string>) => ({ id: row.id, value: row[field] }));
        if (rows.length === 0) break;
        cursor = rows[rows.length - 1].id;

        for (const row of rows) {
          counts.encrypted += 1;
          let rotated: string | null;
          try {
            rotated = reencryptIfStale(crypto, row.value, context);
          } catch {
            counts.failed += 1; // clave ausente o dato manipulado: se reporta, no se toca
            continue;
          }
          if (!rotated) continue;
          counts.stale += 1;
          if (!apply) continue;
          const result = await delegate.updateMany({ where: { id: row.id, [field]: row.value }, data: { [field]: rotated } });
          if (result.count === 1) counts.rotated += 1;
          else counts.changedMeanwhile += 1;
        }
      }

      failures += counts.failed;
      console.log(JSON.stringify({ campo: `${model}.${field}`, ...counts, modo: apply ? 'aplicado' : 'simulacion' }));
    }
  } finally {
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`${failures} valor(es) no se pudieron descifrar: NO retirar ninguna clave del llavero.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Rotación interrumpida:', (error as Error).message);
  process.exitCode = 1;
});
