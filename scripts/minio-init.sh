#!/usr/bin/env bash
# Idempotent initialization scoped to the independent Compose project.
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.prod"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: no existe ${ENV_FILE}." >&2
  exit 1
fi
set -a
source "${ENV_FILE}"
set +a
COMPOSE=(docker compose --project-directory "${PROJECT_DIR}" --env-file "${ENV_FILE}" -p gmm-independent -f "${PROJECT_DIR}/docker-compose.prod.yml")

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER requerido}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD requerido}"
: "${S3_BUCKET:?S3_BUCKET requerido}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY requerido}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY requerido}"
if [[ ! "${S3_BUCKET}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo "ERROR: S3_BUCKET no es un nombre válido de bucket." >&2
  exit 1
fi

MINIO_ALIAS=gmm
POLICY_NAME=gmm-app-policy
deadline=$((SECONDS + 180))
echo "Esperando el MinIO exclusivo del proyecto..."
# Create a known alias using credentials already present inside this container.
until timeout 10 "${COMPOSE[@]}" exec -T minio sh -c 'mc alias set gmm http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null' &&
      timeout 10 "${COMPOSE[@]}" exec -T minio mc ready "${MINIO_ALIAS}" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "ERROR: MinIO no estuvo listo en 180 segundos; revisa sus logs y credenciales." >&2
    exit 1
  fi
  sleep 2
done

echo "Preparando bucket privado y usuario de aplicación..."
"${COMPOSE[@]}" exec -T minio mc mb --ignore-existing "${MINIO_ALIAS}/${S3_BUCKET}"
"${COMPOSE[@]}" exec -T minio mc anonymous set none "${MINIO_ALIAS}/${S3_BUCKET}"
# Existing users are updated by MinIO; any actual error stops the deployment.
"${COMPOSE[@]}" exec -T minio mc admin user add "${MINIO_ALIAS}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}"

"${COMPOSE[@]}" exec -T minio mc admin policy create "${MINIO_ALIAS}" "${POLICY_NAME}" /dev/stdin <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}"
    }
  ]
}
EOF

# Skip an already attached policy without swallowing permissions/network errors.
USER_INFO="$("${COMPOSE[@]}" exec -T minio mc admin user info "${MINIO_ALIAS}" "${S3_ACCESS_KEY}" --json)"
if ! grep -Eq '"policyName"[[:space:]]*:[[:space:]]*"([^",]*,)*gmm-app-policy(,[^",]*)*"' <<< "${USER_INFO}"; then
  "${COMPOSE[@]}" exec -T minio mc admin policy attach "${MINIO_ALIAS}" "${POLICY_NAME}" --user "${S3_ACCESS_KEY}"
fi
echo "MinIO inicializado: bucket privado y permisos de objetos/HEAD limitados a este proyecto."
