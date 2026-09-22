#!/usr/bin/env bash
# =============================================================================
# scripts/deploy.sh  ·  Despliegue de producción seguro
# =============================================================================
# Diferencias clave vs el script original:
#   1. Usa docker-compose.prod.yml (aislamiento de red, sin puertos al host)
#   2. Verifica que .env.prod exista y tenga las variables CRÍTICAS antes de
#      arrancar nada — evita arrancar con defaults inseguros.
#   3. Nunca copia .env.example a .env.prod automáticamente.
#   4. Verifica que secrets críticos no tengan valores de ejemplo conocidos.
# =============================================================================
set -euo pipefail

ENV_FILE=".env.prod"

# --------------------------------------------------------------------------- #
# 1. Verificar archivo de entorno
# --------------------------------------------------------------------------- #
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌  ${ENV_FILE} no existe."
  echo "    Crea el archivo a partir de .env.example y configura TODAS las variables"
  echo "    de producción ANTES de desplegar. Nunca uses .env.example en producción."
  exit 1
fi

# Cargar variables sin exportar todo al entorno del shell
set -a
source "${ENV_FILE}"
set +a

# --------------------------------------------------------------------------- #
# 2. Verificar variables críticas (deben existir y tener valor)
# --------------------------------------------------------------------------- #
REQUIRED_VARS=(
  DB_USER DB_PASSWORD DB_NAME
  REDIS_PASSWORD
  MEILI_MASTER_KEY
  MINIO_ROOT_USER MINIO_ROOT_PASSWORD
  S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY
  JWT_SECRET JWT_REFRESH_SECRET COOKIE_SECRET
  FRONTEND_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_SITE_URL
  MAIL_FROM SMTP_HOST SMTP_USER SMTP_PASS
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    MISSING+=("${var}")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "❌  Las siguientes variables requeridas están vacías o no existen en ${ENV_FILE}:"
  for v in "${MISSING[@]}"; do echo "    - ${v}"; done
  exit 1
fi

# --------------------------------------------------------------------------- #
# 3. Detectar valores de ejemplo conocidos que NUNCA deben usarse en producción
# --------------------------------------------------------------------------- #
FORBIDDEN_DEFAULTS=(
  "password"
  "supersecret123"
  "dev_master_key_123"
  "change_me"
  "admin"
  "secret"
)

INSECURE=()
for var in DB_PASSWORD MINIO_ROOT_PASSWORD MEILI_MASTER_KEY JWT_SECRET JWT_REFRESH_SECRET COOKIE_SECRET REDIS_PASSWORD; do
  val="${!var:-}"
  for forbidden in "${FORBIDDEN_DEFAULTS[@]}"; do
    if [[ "${val}" == *"${forbidden}"* ]]; then
      INSECURE+=("${var} contiene el valor inseguro '${forbidden}'")
    fi
  done
done

if [[ ${#INSECURE[@]} -gt 0 ]]; then
  echo "❌  CREDENCIALES INSEGURAS detectadas en ${ENV_FILE}:"
  for msg in "${INSECURE[@]}"; do echo "    - ${msg}"; done
  echo ""
  echo "    Genera valores seguros con:"
  echo "      openssl rand -base64 48"
  exit 1
fi

# --------------------------------------------------------------------------- #
# 4. Despliegue
# --------------------------------------------------------------------------- #
echo "✅  Variables de entorno verificadas."
echo ""
echo "📦  Actualizando imágenes..."
docker compose -f docker-compose.prod.yml pull

echo ""
echo "🔨  Construyendo imágenes de la aplicación..."
docker compose -f docker-compose.prod.yml build --no-cache

echo ""
echo "🚀  Arrancando servicios..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "⏳  Esperando que la base de datos esté lista..."
until docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U "${DB_USER}" -q; do
  sleep 2
done

echo ""
echo "⏳  Esperando que MinIO esté listo..."
until docker compose -f docker-compose.prod.yml exec -T minio mc ready local >/dev/null 2>&1; do
  sleep 2
done

echo ""
echo "🪣  Inicializando bucket y usuario de servicio de MinIO (idempotente)..."
bash scripts/minio-init.sh

echo ""
echo "🔄  Ejecutando migraciones..."
docker compose -f docker-compose.prod.yml exec -T api npx prisma migrate deploy

echo ""
echo "✅  Despliegue completado."
echo "    Verifica el estado: docker compose -f docker-compose.prod.yml ps"
echo "    Verifica los logs:  docker compose -f docker-compose.prod.yml logs -f"
