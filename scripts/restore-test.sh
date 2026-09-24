#!/usr/bin/env bash
# =============================================================================
# Prueba de restauración: "un respaldo no probado no es un respaldo".
#
#   scripts/restore-test.sh                       # último respaldo de la BD
#   scripts/restore-test.sh /ruta/gmm-db-...dump.gpg
#
# 1. Descifra el respaldo (gpg) dentro de un directorio temporal privado.
# 2. Lo restaura en un PostgreSQL desechable, en una red Docker aislada y sin
#    puertos publicados (no toca la base de producción).
# 3. Compara los conteos de filas con el manifiesto del respaldo.
# 4. Con la imagen de la API y las claves de producción, descifra todos los
#    campos cifrados; con claves al azar, comprueba que NO se pueden leer.
# 5. Borra todo y anota el resultado en restore-tests.log.
# =============================================================================
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="gmm-independent"
BACKUP_ROOT="${GMM_BACKUP_DIR:-/var/backups/guiamedicamonagas}"
PASSPHRASE_FILE="${GMM_BACKUP_PASSPHRASE_FILE:-/root/.config/guiamedicamonagas/backup-passphrase}"
ENV_FILE="${PROJECT_DIR}/.env.prod"
PG_IMAGE="postgres:16.4-alpine"
RUN_ID="gmm-restore-test-$(date -u +%Y%m%d%H%M%S)"

BACKUP_FILE="${1:-$(ls -1t "${BACKUP_ROOT}"/db/gmm-db-*.dump.gpg 2>/dev/null | head -n1)}"
[[ -n "${BACKUP_FILE}" && -r "${BACKUP_FILE}" ]] || { echo "ERROR: no hay respaldo que probar en ${BACKUP_ROOT}/db" >&2; exit 1; }
MANIFEST="${BACKUP_FILE%.dump.gpg}.manifest.json"

WORK="$(mktemp -d /var/tmp/gmm-restore.XXXXXX)"
chmod 700 "${WORK}"
cleanup() {
  docker rm -f "${RUN_ID}-db" >/dev/null 2>&1 || true
  docker network rm "${RUN_ID}" >/dev/null 2>&1 || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

log_result() {
  mkdir -p "${BACKUP_ROOT}"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1 $(basename "${BACKUP_FILE}") $2" >> "${BACKUP_ROOT}/restore-tests.log"
}
fail() { echo "FALLO: $1" >&2; log_result FAIL "$1"; exit 1; }

# 1. Integridad y descifrado
if [[ -r "${MANIFEST}" ]]; then
  expected_sha="$(jq -r .sha256 "${MANIFEST}")"
  [[ "$(sha256sum "${BACKUP_FILE}" | cut -d' ' -f1)" == "${expected_sha}" ]] || fail "sha256 distinto al del manifiesto"
fi
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "${PASSPHRASE_FILE}" \
  -o "${WORK}/db.dump" --decrypt "${BACKUP_FILE}" || fail "no se pudo descifrar"
chmod 644 "${WORK}/db.dump" # lo lee el usuario postgres del contenedor desechable

# 2. PostgreSQL desechable, red interna sin salida ni puertos
docker network create --internal "${RUN_ID}" >/dev/null
docker run -d --name "${RUN_ID}-db" --network "${RUN_ID}" --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e POSTGRES_DB=gmm_restore_test \
  -v "${WORK}/db.dump:/restore/db.dump:ro" "${PG_IMAGE}" >/dev/null
for _ in $(seq 1 60); do
  docker exec "${RUN_ID}-db" pg_isready -U restore -d gmm_restore_test -q && break
  sleep 1
done
docker exec "${RUN_ID}-db" pg_isready -U restore -d gmm_restore_test -q || fail "PostgreSQL de prueba no arrancó"
docker exec "${RUN_ID}-db" pg_restore -U restore -d gmm_restore_test --no-owner --no-privileges --exit-on-error /restore/db.dump \
  || fail "pg_restore falló"

# 3. Conteos contra el manifiesto
COUNTS="$(docker exec -i "${RUN_ID}-db" psql -U restore -d gmm_restore_test -A -t -x -F "=" <<'SQL'
SELECT (SELECT count(*) FROM "User") AS users,
       (SELECT count(*) FROM "ProfessionalProfile") AS professionals,
       (SELECT count(*) FROM "PatientProfile") AS patients,
       (SELECT count(*) FROM "Appointment") AS appointments,
       (SELECT count(*) FROM "Organization") AS organizations,
       (SELECT count(*) FROM "Payment") AS payments,
       (SELECT count(*) FROM "AuditLog") AS "auditLogs";
SQL
)"
if [[ -r "${MANIFEST}" ]]; then
  while IFS='=' read -r table count; do
    [[ -z "${table}" ]] && continue
    expected="$(jq -r ".counts.${table}" "${MANIFEST}")"
    [[ "${count}" == "${expected}" ]] || fail "${table}: ${count} filas restauradas, el manifiesto dice ${expected}"
  done <<< "${COUNTS}"
fi

# 4. Descifrado con las claves de producción (y fallo con claves al azar)
API_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$(docker ps -q --filter "label=com.docker.compose.project=${PROJECT_NAME}" --filter label=com.docker.compose.service=api | head -n1)")"
DB_PASSWORD="$(docker exec "${RUN_ID}-db" printenv POSTGRES_PASSWORD)"
KEYS_ENV="${WORK}/keys.env"
grep -E '^(DATA_ENCRYPTION_KEYS|DATA_ENCRYPTION_ACTIVE_KEY|DATA_LOOKUP_KEY)=' "${ENV_FILE}" > "${KEYS_ENV}"
echo "DATABASE_URL=postgresql://restore:${DB_PASSWORD}@${RUN_ID}-db:5432/gmm_restore_test" >> "${KEYS_ENV}"
DECRYPT_RESULT="$(docker run --rm -i --network "${RUN_ID}" --env-file "${KEYS_ENV}" --entrypoint node "${API_IMAGE}" - <<'NODE'
const { Client } = require('pg');
const { randomBytes } = require('crypto');
const { FieldEncryptionService, parseKeyring } = require('/app/dist/src/crypto/field-encryption.service');
const { ENCRYPTED_FIELDS, ENCRYPTED_VALUE_PREFIX } = require('/app/dist/src/crypto/key-rotation');
const TABLES = { patientProfile: 'PatientProfile', appointment: 'Appointment', clinicalNote: 'ClinicalNote' };
(async () => {
  const real = FieldEncryptionService.fromKeyring(parseKeyring(process.env.DATA_ENCRYPTION_KEYS, process.env.DATA_ENCRYPTION_ACTIVE_KEY || 'v1', process.env.DATA_LOOKUP_KEY));
  const keyIds = process.env.DATA_ENCRYPTION_KEYS.split(',').map((e) => e.split(':')[0]);
  const wrong = FieldEncryptionService.fromKeyring(parseKeyring(keyIds.map((id) => `${id}:${randomBytes(32).toString('base64')}`).join(','), keyIds[0], randomBytes(32).toString('base64')));
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let total = 0, ok = 0, readableWithWrongKeys = 0;
  for (const { model, field, context } of ENCRYPTED_FIELDS) {
    const { rows } = await db.query(`select "${field}" v from "${TABLES[model]}" where "${field}" like $1`, [ENCRYPTED_VALUE_PREFIX + '%']);
    for (const { v } of rows) {
      total += 1;
      try { real.decrypt(v, context); ok += 1; } catch {}
      try { wrong.decrypt(v, context); readableWithWrongKeys += 1; } catch {}
    }
  }
  await db.end();
  console.log(JSON.stringify({ total, ok, readableWithWrongKeys }));
})().catch((e) => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
NODE
)" || fail "comprobación de descifrado: ${DECRYPT_RESULT}"
total="$(jq -r .total <<< "${DECRYPT_RESULT}")"
ok="$(jq -r .ok <<< "${DECRYPT_RESULT}")"
wrong="$(jq -r .readableWithWrongKeys <<< "${DECRYPT_RESULT}")"
[[ "${ok}" == "${total}" ]] || fail "solo ${ok}/${total} campos cifrados se descifran con las claves de producción"
[[ "${wrong}" == "0" ]] || fail "${wrong} campos se leyeron con claves al azar"

SUMMARY="$(tr '\n' ' ' <<< "${COUNTS}")cifrados=${ok}/${total} con_claves_falsas=0"
log_result OK "${SUMMARY}"
echo "OK restauración verificada: ${SUMMARY}"
