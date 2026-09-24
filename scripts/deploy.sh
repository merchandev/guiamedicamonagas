#!/usr/bin/env bash
# Deploy only this project's services. Run from any working directory.
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.prod"
PROJECT_NAME="gmm-independent"
COMPOSE=(docker compose --project-directory "${PROJECT_DIR}" --env-file "${ENV_FILE}" -p "${PROJECT_NAME}" -f "${PROJECT_DIR}/docker-compose.prod.yml")
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: configura ${ENV_FILE} con credenciales propias antes de desplegar." >&2
  exit 1
fi
# This deployment file is trusted configuration owned by the operator.
set -a
source "${ENV_FILE}"
set +a

REQUIRED_VARS=(
  DB_USER DB_PASSWORD DB_NAME REDIS_PASSWORD MEILI_MASTER_KEY
  MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY
  JWT_SECRET JWT_REFRESH_SECRET COOKIE_SECRET DATA_ENCRYPTION_KEYS DATA_LOOKUP_KEY
  FRONTEND_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_SITE_URL S3_PUBLIC_ENDPOINT
  MAIL_FROM SMTP_HOST SEED_SUPERADMIN_EMAIL SEED_SUPERADMIN_PASSWORD
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

"${COMPOSE[@]}" config --quiet
SERVICES="$("${COMPOSE[@]}" config --services)"
DATA_SERVICES=(postgres redis meilisearch minio)
EXTERNAL_SERVICES=(postgres redis meilisearch minio caddy)
if grep -qx mailpit <<< "${SERVICES}"; then
  DATA_SERVICES+=(mailpit)
  EXTERNAL_SERVICES+=(mailpit)
fi

echo "Actualizando imágenes externas del proyecto ${PROJECT_NAME}..."
"${COMPOSE[@]}" pull "${EXTERNAL_SERVICES[@]}"
echo "Construyendo API y web..."
BUILD_ARGS=()
if [[ -n "${GMM_BUILDER:-}" ]]; then
  BUILD_ARGS+=(--builder "${GMM_BUILDER}")
fi
"${COMPOSE[@]}" build "${BUILD_ARGS[@]}" api web

echo "Arrancando los servicios de datos..."
"${COMPOSE[@]}" up -d --no-deps "${DATA_SERVICES[@]}"
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

echo "Arrancando API, web y proxy propios..."
"${COMPOSE[@]}" up -d --wait --wait-timeout 180 api web caddy
"${COMPOSE[@]}" ps
echo "Despliegue completado: ${NEXT_PUBLIC_SITE_URL}"
