#!/usr/bin/env bash
# Define o cambia el código de seguridad de la bóveda de pacientes: lo que la
# administración (incluido SUPERADMIN) debe ingresar para ver registros de
# pacientes. En .env.prod queda SOLO el hash Argon2id en base64; el código no
# se guarda en ningún archivo ni aparece en la lista de procesos.
#
#   bash scripts/set-patient-vault-code.sh            # lo pide dos veces, sin mostrarlo
#   printf '%s' "$CODIGO" | bash scripts/set-patient-vault-code.sh   # no interactivo
#
# Al cambiarlo se cierran todas las bóvedas abiertas y se recrea solo `api`.
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.prod"
PROJECT_NAME="gmm-independent"
COMPOSE=(docker compose --project-directory "${PROJECT_DIR}" --env-file "${ENV_FILE}" -p "${PROJECT_NAME}" -f "${PROJECT_DIR}/docker-compose.prod.yml")

[[ -f "${ENV_FILE}" ]] || { echo "ERROR: no existe ${ENV_FILE}" >&2; exit 1; }

if [[ -t 0 ]]; then
  read -r -s -p "Nuevo código de seguridad: " CODE; echo
  read -r -s -p "Repítelo: " CONFIRM; echo
  [[ "${CODE}" == "${CONFIRM}" ]] || { echo "ERROR: los códigos no coinciden" >&2; exit 1; }
else
  IFS= read -r CODE || true
fi
(( ${#CODE} >= 8 )) || { echo "ERROR: el código debe tener al menos 8 caracteres" >&2; exit 1; }

# El código entra por stdin al contenedor de la API (que ya trae argon2).
HASH_B64="$(printf '%s' "${CODE}" | "${COMPOSE[@]}" exec -T api node -e "
  let code = '';
  process.stdin.on('data', (d) => (code += d)).on('end', async () => {
    const argon2 = require('argon2');
    const hash = await argon2.hash(code, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    process.stdout.write(Buffer.from(hash).toString('base64'));
  });
")"
unset CODE CONFIRM
[[ -n "${HASH_B64}" ]] || { echo "ERROR: no se pudo calcular el hash" >&2; exit 1; }

BACKUP_DIR="${PROJECT_DIR}/backups"
mkdir -p "${BACKUP_DIR}"
cp -p "${ENV_FILE}" "${BACKUP_DIR}/env.prod.pre-vault-$(date -u +%Y%m%dT%H%M%SZ)"

TMP="$(mktemp "${ENV_FILE}.XXXXXX")"
grep -v '^PATIENT_VAULT_CODE_HASH=' "${ENV_FILE}" > "${TMP}" || true
printf 'PATIENT_VAULT_CODE_HASH=%s\n' "${HASH_B64}" >> "${TMP}"
chmod --reference="${ENV_FILE}" "${TMP}"
mv "${TMP}" "${ENV_FILE}"

"${COMPOSE[@]}" up -d --no-deps --force-recreate api
# Antes de la primera migración de la bóveda la tabla no existe: no hay nada que cerrar.
# shellcheck disable=SC2016
"${COMPOSE[@]}" exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -c "update \"PatientVaultSession\" set \"closedAt\" = now() where \"closedAt\" is null"' >/dev/null 2>&1 || true

for _ in $(seq 1 30); do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' "${PROJECT_NAME}-api-1" 2>/dev/null)" == "healthy" ]]; then
    echo "Código de la bóveda actualizado; bóvedas abiertas cerradas y API sana."
    exit 0
  fi
  sleep 5
done
echo "ERROR: la API no quedó sana tras el cambio; revisa: docker logs ${PROJECT_NAME}-api-1" >&2
exit 1
