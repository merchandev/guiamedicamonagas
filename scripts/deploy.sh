#!/usr/bin/env bash
# Deploy only this project's services. Run from any working directory.
#
#   scripts/deploy.sh                    # despliegue normal (avisa los NO-GO)
#   GMM_REQUIRE_GO=true scripts/deploy.sh   # falla ante cualquier NO-GO (pacientes reales)
#   scripts/deploy.sh --informe          # solo imprime el informe GO / NO-GO, sin desplegar
#
# Ver docs/operations/go-no-go.md y docs/DEPLOYMENT-INDEPENDENT.md.
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.prod"
PROJECT_NAME="gmm-independent"
COMPOSE=(docker compose --project-directory "${PROJECT_DIR}" --env-file "${ENV_FILE}" -p "${PROJECT_NAME}" -f "${PROJECT_DIR}/docker-compose.prod.yml")
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"
BACKUP_ROOT="${GMM_BACKUP_DIR:-/var/backups/guiamedicamonagas}"
PASSPHRASE_FILE="${GMM_BACKUP_PASSPHRASE_FILE:-/root/.config/guiamedicamonagas/backup-passphrase}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: configura ${ENV_FILE} con credenciales propias antes de desplegar." >&2
  exit 1
fi
# This deployment file is trusted configuration owned by the operator.
set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

REQUIRED_VARS=(
  DB_USER DB_PASSWORD DB_NAME REDIS_PASSWORD MEILI_MASTER_KEY
  MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY
  JWT_SECRET JWT_REFRESH_SECRET COOKIE_SECRET DATA_ENCRYPTION_KEYS DATA_LOOKUP_KEY
  FRONTEND_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_SITE_URL S3_PUBLIC_ENDPOINT
  MAIL_FROM SMTP_HOST SEED_SUPERADMIN_EMAIL SEED_SUPERADMIN_PASSWORD
  CLAMAV_HOST
)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  [[ -n "${!var:-}" ]] || MISSING+=("${var}")
done
if (( ${#MISSING[@]} )); then
  printf 'ERROR: variable requerida vacía: %s\n' "${MISSING[@]}" >&2
  exit 1
fi
# SMTP authentication is optional for this project's internal mail catcher.
if [[ -n "${SMTP_USER:-}" && -z "${SMTP_PASS:-}" ]] || [[ -z "${SMTP_USER:-}" && -n "${SMTP_PASS:-}" ]]; then
  echo "ERROR: SMTP_USER y SMTP_PASS deben configurarse juntos." >&2
  exit 1
fi
for var in DB_PASSWORD REDIS_PASSWORD MINIO_ROOT_PASSWORD MEILI_MASTER_KEY S3_SECRET_KEY JWT_SECRET JWT_REFRESH_SECRET COOKIE_SECRET SEED_SUPERADMIN_PASSWORD; do
  case "${!var}" in
    password|supersecret123|dev_master_key_123|change_me|admin|secret)
      echo "ERROR: ${var} contiene una credencial de ejemplo." >&2
      exit 1
      ;;
  esac
done

# --- MFA de administradores: obligatorio, salvo excepción fechada y vigente ----
TODAY="$(date -u +%F)"
if [[ "${ADMIN_MFA_ENABLED:-false}" != "true" ]]; then
  if [[ -z "${ADMIN_MFA_WAIVER_UNTIL:-}" ]]; then
    echo "ERROR: ADMIN_MFA_ENABLED debe ser true (o declarar ADMIN_MFA_WAIVER_UNTIL=AAAA-MM-DD mientras se configura el SMTP)." >&2
    exit 1
  fi
  if [[ "${ADMIN_MFA_WAIVER_UNTIL}" < "${TODAY}" ]]; then
    echo "ERROR: la excepción de MFA venció el ${ADMIN_MFA_WAIVER_UNTIL}: configurar SMTP real y ADMIN_MFA_ENABLED=true." >&2
    exit 1
  fi
  WAIVER_DAYS=$(( ( $(date -u -d "${ADMIN_MFA_WAIVER_UNTIL}" +%s) - $(date -u -d "${TODAY}" +%s) ) / 86400 ))
  if (( WAIVER_DAYS <= 14 )); then
    echo "AVISO: la excepción de MFA vence en ${WAIVER_DAYS} días (${ADMIN_MFA_WAIVER_UNTIL}); desde ese día este script no despliega sin SMTP real y ADMIN_MFA_ENABLED=true."
  fi
fi

# Configuración del servidor fuera del repositorio: copia externa de respaldos y alertas.
CONFIG_DIR="/root/.config/guiamedicamonagas"
# shellcheck source=/dev/null
[[ -r "${CONFIG_DIR}/backup.env" ]] && source "${CONFIG_DIR}/backup.env"

# --- Informe GO / NO-GO para operar con pacientes reales -----------------------
NO_GO=()
[[ "${COOKIE_SECURE:-true}" == "true" ]] || NO_GO+=("COOKIE_SECURE no es true")
for var in FRONTEND_URL NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_API_URL S3_PUBLIC_ENDPOINT; do
  # Una ruta relativa (NEXT_PUBLIC_API_URL=/api/v1) hereda el HTTPS de la página.
  [[ "${!var}" == https://* || ( "${var}" == NEXT_PUBLIC_API_URL && "${!var}" == /* ) ]] || NO_GO+=("${var} no usa HTTPS")
done
[[ "${CADDY_BIND_ADDRESS:-127.0.0.1}" == "127.0.0.1" ]] || NO_GO+=("el puerto ${CADDY_PORT:-8088} está publicado a Internet (CADDY_BIND_ADDRESS=${CADDY_BIND_ADDRESS})")
[[ "${ADMIN_MFA_ENABLED:-false}" == "true" ]] || NO_GO+=("MFA de administradores con excepción hasta ${ADMIN_MFA_WAIVER_UNTIL}")
[[ -n "${PATIENT_VAULT_CODE_HASH:-}" ]] || NO_GO+=("bóveda de pacientes sin código de seguridad (scripts/set-patient-vault-code.sh)")
[[ -r "${PASSPHRASE_FILE}" ]] || NO_GO+=("sin frase de cifrado de respaldos (${PASSPHRASE_FILE})")
if ! grep -q ' OK ' "${BACKUP_ROOT}/restore-tests.log" 2>/dev/null; then
  NO_GO+=("sin prueba de restauración correcta registrada")
fi
# Copia externa: configurada, al día (≤ 26 h) y probada desde afuera (≤ 35 días).
if [[ -z "${GMM_BACKUP_REMOTE:-}" ]]; then
  NO_GO+=("respaldos sin copia fuera del servidor (GMM_BACKUP_REMOTE en ${CONFIG_DIR}/backup.env)")
else
  [[ -n "$(find "${BACKUP_ROOT}/last-remote-success" -mmin -1560 2>/dev/null)" ]] \
    || NO_GO+=("la copia externa de respaldos no se completó en las últimas 26 h")
  LAST_REMOTE_TEST="$(grep -E ' OK .*origen=remoto' "${BACKUP_ROOT}/restore-tests.log" 2>/dev/null | tail -1 | cut -d' ' -f1)"
  if [[ -z "${LAST_REMOTE_TEST}" ]] || (( $(date -u +%s) - $(date -u -d "${LAST_REMOTE_TEST}" +%s) > 35 * 86400 )); then
    NO_GO+=("sin prueba de restauración desde la copia externa en los últimos 35 días (scripts/restore-test.sh --from-remote)")
  fi
fi
# Claves de datos y frase de respaldos custodiadas fuera del servidor (y que sigan siendo las vigentes).
bash "${PROJECT_DIR}/scripts/key-escrow.sh" status >/dev/null 2>&1 \
  || NO_GO+=("claves de cifrado y frase de respaldos sin custodia externa vigente (scripts/key-escrow.sh)")
# Correo real: con Mailpit no llegan verificaciones, recuperaciones de contraseña ni códigos de MFA.
[[ "${SMTP_HOST}" != "mailpit" ]] || NO_GO+=("correo sin SMTP real (Mailpit no entrega fuera del servidor)")
# Alguien debe enterarse de una caída.
grep -qsE '^(GMM_ALERT_TELEGRAM_BOT_TOKEN|GMM_ALERT_EMAIL_TO|GMM_ALERT_NTFY_URL|GMM_ALERT_WEBHOOK_URL|GMM_HEARTBEAT_URL)=.+' "${CONFIG_DIR}/alerts.env" \
  || NO_GO+=("monitoreo sin canal de alertas (${CONFIG_DIR}/alerts.env; ver docs/operations/monitoreo-y-alertas.md)")
# Responsable legal publicado en el Aviso legal y la Política de privacidad.
if sed -n '/^export const DATA_CONTROLLER/,/^};/p' "${PROJECT_DIR}/frontend/src/lib/legal.ts" | grep -q ': null'; then
  NO_GO+=("datos del titular sin publicar en el Aviso legal y la Política de privacidad (DATA_CONTROLLER en frontend/src/lib/legal.ts)")
fi
if (( ${#NO_GO[@]} )); then
  echo "NO-GO para pacientes reales (el despliegue continúa salvo GMM_REQUIRE_GO=true):"
  printf '  - %s\n' "${NO_GO[@]}"
  if [[ "${GMM_REQUIRE_GO:-false}" == "true" ]]; then
    echo "ERROR: GMM_REQUIRE_GO=true y hay puntos NO-GO." >&2
    exit 1
  fi
else
  echo "GO: todos los controles de producción en verde."
fi
[[ "${1:-}" == "--informe" ]] && exit 0

"${COMPOSE[@]}" config --quiet
SERVICES="$("${COMPOSE[@]}" config --services)"
DATA_SERVICES=(postgres redis meilisearch minio)
EXTERNAL_SERVICES=(postgres redis meilisearch minio caddy clamav)
if grep -qx mailpit <<< "${SERVICES}"; then
  DATA_SERVICES+=(mailpit)
  EXTERNAL_SERVICES+=(mailpit)
fi

# --- Respaldo previo y punto de retorno --------------------------------------
# El código se actualiza (git merge --ff-only origin/main) antes de ejecutar este script, así que el
# commit que estaba en marcha se lee de deployed-sha, no de HEAD.
PREVIOUS_SHA="$(cat "${BACKUP_ROOT}/deployed-sha" 2>/dev/null || git -C "${PROJECT_DIR}" rev-parse HEAD 2>/dev/null || echo desconocido)"
if [[ -n "$(docker ps -q --filter "label=com.docker.compose.project=${PROJECT_NAME}" --filter label=com.docker.compose.service=postgres)" ]]; then
  if [[ -r "${PASSPHRASE_FILE}" ]]; then
    echo "Respaldo cifrado previo al despliegue..."
    bash "${PROJECT_DIR}/scripts/backup.sh" --label pre-deploy
  elif [[ "${GMM_SKIP_BACKUP:-false}" != "true" ]]; then
    echo "ERROR: no se puede respaldar antes de desplegar (falta ${PASSPHRASE_FILE}). GMM_SKIP_BACKUP=true lo omite bajo tu responsabilidad." >&2
    exit 1
  fi
fi
for service in api web; do
  image="gmm-independent-${service}:${GMM_IMAGE_TAG:-local}"
  if docker image inspect "${image}" >/dev/null 2>&1; then
    docker tag "${image}" "gmm-independent-${service}:rollback"
  fi
done
mkdir -p "${BACKUP_ROOT}"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) inicio desde=${PREVIOUS_SHA}" >> "${BACKUP_ROOT}/deploys.log"

echo "Actualizando imágenes externas del proyecto ${PROJECT_NAME}..."
# Las imágenes van fijadas por etiqueta: si un registro no responde (quay.io ya
# no sirve la de MinIO sin autenticación), basta la copia local. Solo se
# detiene si alguna imagen no está en el servidor.
"${COMPOSE[@]}" pull --ignore-pull-failures "${EXTERNAL_SERVICES[@]}" || true
MISSING_IMAGES=()
while read -r external_image; do
  docker image inspect "${external_image}" >/dev/null 2>&1 || MISSING_IMAGES+=("${external_image}")
done < <("${COMPOSE[@]}" config --images "${EXTERNAL_SERVICES[@]}")
if (( ${#MISSING_IMAGES[@]} )); then
  printf 'ERROR: imagen no disponible ni en el registro ni en el servidor: %s\n' "${MISSING_IMAGES[@]}" >&2
  exit 1
fi
echo "Construyendo API y web..."
# El commit queda dentro de las imágenes: /api/v1/health y /version.json lo
# muestran y, al final, se comprueba que es el que se acaba de publicar.
GMM_GIT_SHA="$(git -C "${PROJECT_DIR}" rev-parse HEAD 2>/dev/null || echo dev)"
GMM_BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GMM_GIT_SHA GMM_BUILD_DATE
BUILD_ARGS=()
if [[ -n "${GMM_BUILDER:-}" ]]; then
  BUILD_ARGS+=(--builder "${GMM_BUILDER}")
fi
"${COMPOSE[@]}" build "${BUILD_ARGS[@]}" api web

echo "Arrancando los servicios de datos y el antivirus..."
"${COMPOSE[@]}" up -d --no-deps "${DATA_SERVICES[@]}" clamav
deadline=$((SECONDS + 180))
until timeout 10 "${COMPOSE[@]}" exec -T postgres pg_isready -U "${DB_USER}" -d "${DB_NAME}" -t 5 -q; do
  if (( SECONDS >= deadline )); then
    echo "ERROR: PostgreSQL no estuvo listo en 180 segundos." >&2
    exit 1
  fi
  sleep 2
done

bash "${PROJECT_DIR}/scripts/minio-init.sh"
echo "Aplicando migraciones antes de publicar la aplicación..."
"${COMPOSE[@]}" run --rm --no-deps api node_modules/.bin/prisma migrate deploy
echo "Inicializando catálogos y administrador..."
"${COMPOSE[@]}" run --rm --no-deps -e SEED_SUPERADMIN_EMAIL -e SEED_SUPERADMIN_PASSWORD api node dist/prisma/seed.js

# La imagen nueva valida su configuración ANTES de reemplazar los contenedores
# en marcha: un error de entorno detiene aquí el despliegue sin tumbar el sitio.
echo "Validando la configuración de producción con la imagen nueva..."
"${COMPOSE[@]}" run --rm --no-deps api node -e "require('./dist/src/config/env.validation').validateEnv(process.env); console.log('Configuración válida')"

# ClamAV necesita sus firmas cargadas antes de aceptar subidas (falla cerrado).
echo "Esperando al antivirus..."
deadline=$((SECONDS + 420))
until [[ "$(docker inspect --format '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q clamav)")" == "healthy" ]]; do
  if (( SECONDS >= deadline )); then
    echo "ERROR: ClamAV no quedó sano en 7 minutos." >&2
    exit 1
  fi
  sleep 5
done

echo "Arrancando API, web y proxy propios..."
"${COMPOSE[@]}" up -d --wait --wait-timeout 180 api web caddy

# El Caddyfile se monta como archivo suelto: `git merge` lo reemplaza por otro
# inodo y el contenedor seguiría leyendo el anterior. Si cambió, se valida y se
# recrea solo caddy (unos segundos sin proxy). La validación usa un contenedor
# suelto, sin las etiquetas de Traefik, para que nunca reciba tráfico.
if ! "${COMPOSE[@]}" exec -T caddy cat /etc/caddy/Caddyfile | cmp -s - "${PROJECT_DIR}/Caddyfile"; then
  echo "El Caddyfile cambió: validando y recreando caddy..."
  CADDY_IMAGE="$(docker inspect -f '{{.Config.Image}}' "${PROJECT_NAME}-caddy-1")"
  docker run --rm -e S3_BUCKET="${S3_BUCKET}" -v "${PROJECT_DIR}/Caddyfile:/etc/caddy/Caddyfile:ro" "${CADDY_IMAGE}" \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
    || { echo "ERROR: el Caddyfile nuevo no es válido; caddy sigue con el anterior" >&2; exit 1; }
  "${COMPOSE[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 60 caddy
fi

# La API cifra en su arranque cualquier dato heredado en claro y borra la tabla
# temporal: si sigue existiendo, el despliegue NO está completo.
LEGACY="$("${COMPOSE[@]}" exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -At \
  -c "SELECT coalesce(to_regclass('public.\"_PatientPlaintextLegacy\"')::text, '')")"
if [[ -n "${LEGACY}" ]]; then
  echo "ERROR: la tabla _PatientPlaintextLegacy sigue existiendo: revisar los logs de la API antes de dar por bueno el despliegue." >&2
  "${COMPOSE[@]}" logs --tail=100 api >&2
  exit 1
fi

# Prueba de humo con cuenta temporal (solo con el Mailpit interno: con SMTP
# real enviaría correos de verdad a un buzón inexistente).
if [[ "${SMTP_HOST}" == "mailpit" ]]; then
  echo "Prueba de humo..."
  "${COMPOSE[@]}" exec -T -e SEED_SUPERADMIN_EMAIL -e SEED_SUPERADMIN_PASSWORD api node - < "${PROJECT_DIR}/scripts/smoke-deployment.cjs"
fi

# Producción debe responder con el commit recién construido (API y web, por el
# mismo camino que el tráfico real): si no, algo quedó con la versión anterior.
EXPECTED_VERSION="${GMM_GIT_SHA:0:12}"
for path in /api/v1/health /version.json; do
  served="$(curl -sf -m 10 "http://127.0.0.1:${CADDY_PORT:-8088}${path}" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
  if [[ "${served}" != "${EXPECTED_VERSION}" ]]; then
    echo "ERROR: ${path} informa la versión '${served}' y se esperaba ${EXPECTED_VERSION}." >&2
    exit 1
  fi
done
echo "Versión publicada: ${EXPECTED_VERSION} (API y web)."

# Tareas programadas del proyecto (respaldos, pruebas de restauración y
# monitoreo): si el archivo del repositorio cambió, se instala el nuevo.
CRON_SRC="${PROJECT_DIR}/scripts/cron/guiamedicamonagas"
CRON_DST="/etc/cron.d/guiamedicamonagas"
if [[ -w /etc/cron.d ]] && ! cmp -s "${CRON_SRC}" "${CRON_DST}"; then
  install -m 644 "${CRON_SRC}" "${CRON_DST}"
  echo "Tareas programadas actualizadas (${CRON_DST})."
fi

"${COMPOSE[@]}" ps
DEPLOYED_SHA="$(git -C "${PROJECT_DIR}" rev-parse HEAD 2>/dev/null || echo desconocido)"
echo "${DEPLOYED_SHA}" > "${BACKUP_ROOT}/deployed-sha"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ok desde=${PREVIOUS_SHA} hasta=${DEPLOYED_SHA}" >> "${BACKUP_ROOT}/deploys.log"
echo "Despliegue completado: ${NEXT_PUBLIC_SITE_URL}"
echo "Para volver atrás: git checkout ${PREVIOUS_SHA} e imágenes gmm-independent-{api,web}:rollback (ver docs/operations/go-no-go.md)."
