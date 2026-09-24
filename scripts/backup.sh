#!/usr/bin/env bash
# =============================================================================
# Respaldo cifrado de Guía Médica Monagas (proyecto Compose gmm-independent).
#
#   scripts/backup.sh                  # base de datos
#   scripts/backup.sh --with-files     # base de datos + archivos de MinIO
#   scripts/backup.sh --label pre-deploy
#
# - El volcado de PostgreSQL va directo de pg_dump a gpg (AES-256): nunca
#   queda en disco sin cifrar.
# - La frase de cifrado vive en GMM_BACKUP_PASSPHRASE_FILE (fuera del repo y
#   del directorio de respaldos) y debe guardarse TAMBIÉN fuera del VPS.
# - Las claves de datos (DATA_ENCRYPTION_KEYS / DATA_LOOKUP_KEY) NO se
#   incluyen: un respaldo robado no permite leer cédulas ni datos de salud.
# - Cada respaldo deja un manifiesto con conteos de filas, que usa
#   scripts/restore-test.sh para comprobar la restauración.
# Ver docs/operations/respaldos-y-restauracion.md.
# =============================================================================
set -euo pipefail

PROJECT_NAME="gmm-independent"
BACKUP_ROOT="${GMM_BACKUP_DIR:-/var/backups/guiamedicamonagas}"
PASSPHRASE_FILE="${GMM_BACKUP_PASSPHRASE_FILE:-/root/.config/guiamedicamonagas/backup-passphrase}"
KEEP_DB_DAYS="${GMM_BACKUP_KEEP_DB_DAYS:-14}"
KEEP_FILES_DAYS="${GMM_BACKUP_KEEP_FILES_DAYS:-56}"
# Copia fuera del servidor (regla 3-2-1): destino rsync "usuario@host:/ruta".
# Mientras no esté configurado, el respaldo existe solo en este VPS.
REMOTE_TARGET="${GMM_BACKUP_REMOTE:-}"

WITH_FILES=false
LABEL="daily"
while (( $# )); do
  case "$1" in
    --with-files) WITH_FILES=true ;;
    --label) LABEL="$2"; shift ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ ! -r "${PASSPHRASE_FILE}" ]]; then
  echo "ERROR: falta la frase de cifrado en ${PASSPHRASE_FILE} (ver docs/operations/respaldos-y-restauracion.md)." >&2
  exit 1
fi

container_of() {
  docker ps -q --filter "label=com.docker.compose.project=${PROJECT_NAME}" --filter "label=com.docker.compose.service=$1" | head -n1
}
PG_CONTAINER="$(container_of postgres)"
[[ -n "${PG_CONTAINER}" ]] || { echo "ERROR: el contenedor postgres de ${PROJECT_NAME} no está en marcha." >&2; exit 1; }

umask 077
mkdir -p "${BACKUP_ROOT}/db" "${BACKUP_ROOT}/files"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DB_FILE="${BACKUP_ROOT}/db/gmm-db-${TS}-${LABEL}.dump.gpg"
PARTIAL=""
trap '[[ -n "${PARTIAL}" && -f "${PARTIAL}" ]] && rm -f "${PARTIAL}"' EXIT

encrypt() {
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "${PASSPHRASE_FILE}" \
    --symmetric --cipher-algo AES256 --compress-algo none -o "$1"
}

# --- Base de datos -------------------------------------------------------------
PARTIAL="${DB_FILE}"
docker exec "${PG_CONTAINER}" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6' | encrypt "${DB_FILE}"
PARTIAL=""

COUNTS="$(docker exec -i "${PG_CONTAINER}" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -x -F "="' <<'SQL'
SELECT (SELECT count(*) FROM "User") AS users,
       (SELECT count(*) FROM "ProfessionalProfile") AS professionals,
       (SELECT count(*) FROM "PatientProfile") AS patients,
       (SELECT count(*) FROM "Appointment") AS appointments,
       (SELECT count(*) FROM "Organization") AS organizations,
       (SELECT count(*) FROM "Payment") AS payments,
       (SELECT count(*) FROM "AuditLog") AS "auditLogs";
SQL
)"
{
  echo "{"
  echo "  \"file\": \"$(basename "${DB_FILE}")\","
  echo "  \"createdAt\": \"${TS}\","
  echo "  \"sha256\": \"$(sha256sum "${DB_FILE}" | cut -d' ' -f1)\","
  echo "  \"counts\": {"
  echo "${COUNTS}" | awk -F= '{ printf "%s    \"%s\": %s", (NR>1 ? ",\n" : ""), $1, $2 } END { print "" }'
  echo "  }"
  echo "}"
} > "${DB_FILE%.dump.gpg}.manifest.json"
echo "OK base de datos → ${DB_FILE} ($(du -h "${DB_FILE}" | cut -f1))"

# --- Archivos de MinIO (fotos, documentos, comprobantes) -------------------------
if [[ "${WITH_FILES}" == true ]]; then
  FILES_FILE="${BACKUP_ROOT}/files/gmm-files-${TS}-${LABEL}.tar.gz.gpg"
  PARTIAL="${FILES_FILE}"
  # Se reutiliza la imagen de postgres (ya presente) solo por su tar; volumen en solo lectura.
  docker run --rm --network none -v "${PROJECT_NAME}_miniodata:/data:ro" --entrypoint tar postgres:16.4-alpine \
    -C /data -czf - . | encrypt "${FILES_FILE}"
  PARTIAL=""
  sha256sum "${FILES_FILE}" > "${FILES_FILE}.sha256"
  echo "OK archivos → ${FILES_FILE} ($(du -h "${FILES_FILE}" | cut -f1))"
fi

# --- Retención -----------------------------------------------------------------
find "${BACKUP_ROOT}/db" -type f -name 'gmm-db-*' -mtime +"${KEEP_DB_DAYS}" -delete
find "${BACKUP_ROOT}/files" -type f -name 'gmm-files-*' -mtime +"${KEEP_FILES_DAYS}" -delete

# --- Copia fuera del servidor ----------------------------------------------------
if [[ -n "${REMOTE_TARGET}" ]]; then
  rsync -a --chmod=F600 "${BACKUP_ROOT}/" "${REMOTE_TARGET}/"
  echo "OK copia externa → ${REMOTE_TARGET}"
else
  echo "AVISO: sin copia fuera del servidor (GMM_BACKUP_REMOTE vacío): no cumple la regla 3-2-1."
fi

date -u +%Y-%m-%dT%H:%M:%SZ > "${BACKUP_ROOT}/last-success"
