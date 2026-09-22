#!/usr/bin/env bash
# =============================================================================
# scripts/minio-init.sh
# =============================================================================
# Crea el bucket privado y el usuario de servicio (app user) con permisos
# mínimos en MinIO. Debe ejecutarse UNA VEZ después del primer arranque
# en producción, con acceso al contenedor MinIO via la red interna.
#
# Uso (desde el host, con acceso VPN al servidor):
#   docker exec gmm_minio /bin/sh -c "..."
# O desde el servidor:
#   bash scripts/minio-init.sh
#
# Variables requeridas (del .env.prod):
#   MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
#   S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
# =============================================================================
set -euo pipefail

# Leer variables de entorno
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER requerido}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD requerido}"
: "${S3_BUCKET:?S3_BUCKET requerido}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY (usuario de servicio) requerido}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY (usuario de servicio) requerido}"

MINIO_ALIAS="gmm"
MINIO_HOST="http://minio:9000"

echo "→ Configurando alias MinIO..."
docker exec gmm_minio mc alias set "${MINIO_ALIAS}" "${MINIO_HOST}" \
  "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"

echo "→ Creando bucket ${S3_BUCKET} (si no existe)..."
docker exec gmm_minio mc mb --ignore-existing "${MINIO_ALIAS}/${S3_BUCKET}"

echo "→ Configurando acceso privado en el bucket..."
docker exec gmm_minio mc anonymous set none "${MINIO_ALIAS}/${S3_BUCKET}"

echo "→ Creando usuario de servicio con permisos limitados..."
# Crear usuario de servicio (app user)
docker exec gmm_minio mc admin user add "${MINIO_ALIAS}" \
  "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}"

echo "→ Creando política de permisos mínimos para la API..."
# Política: solo lectura/escritura en el bucket de la app
cat > /tmp/gmm-app-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}"
    }
  ]
}
EOF

docker cp /tmp/gmm-app-policy.json gmm_minio:/tmp/gmm-app-policy.json
docker exec gmm_minio mc admin policy create "${MINIO_ALIAS}" gmm-app-policy \
  /tmp/gmm-app-policy.json

echo "→ Asignando política al usuario de servicio..."
docker exec gmm_minio mc admin policy attach "${MINIO_ALIAS}" gmm-app-policy \
  --user "${S3_ACCESS_KEY}"

echo ""
echo "✅ MinIO inicializado correctamente."
echo "   Bucket:           ${S3_BUCKET}"
echo "   Usuario de app:   ${S3_ACCESS_KEY}"
echo "   Permisos:         GetObject, PutObject, DeleteObject (solo ${S3_BUCKET})"
echo ""
echo "⚠️  Las credenciales root (${MINIO_ROOT_USER}) no deben usarse desde la API."
echo "   Configura S3_ACCESS_KEY y S3_SECRET_KEY en .env.prod con el usuario de servicio."
