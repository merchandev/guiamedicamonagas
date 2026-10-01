#!/usr/bin/env bash
# =============================================================================
# Custodia, fuera del servidor, de lo que hace falta para recuperar los datos.
#
# Sin estas tres cosas no se pueden leer los datos cifrados ni abrir los
# respaldos, y ninguna va dentro de los respaldos:
#   - DATA_ENCRYPTION_KEYS y DATA_LOOKUP_KEY (.env.prod): cifran cédulas,
#     teléfonos y datos de salud;
#   - la frase de cifrado de los respaldos (backup-passphrase).
# Deben guardarse aparte: el gestor de contraseñas del titular y una copia sin
# conexión (impresa o en un medio guardado), nunca junto a los respaldos.
#
#   scripts/key-escrow.sh fingerprints        huellas (no las claves) para comparar copias
#   scripts/key-escrow.sh export [--with-env] archivo cifrado con una frase que eliges, para descargarlo
#   scripts/key-escrow.sh verify ARCHIVO      ¿esa copia corresponde a las claves actuales?
#   scripts/key-escrow.sh confirm             registra que ya guardaste la copia fuera del servidor
#   scripts/key-escrow.sh status              ¿la custodia confirmada sigue vigente? (lo usa deploy.sh)
#
# Nunca muestra las claves ni las escribe en registros. Las huellas son los
# primeros 16 caracteres del SHA-256 de cada valor: sirven para comparar, no
# para reconstruir la clave. Ver docs/operations/respaldos-y-restauracion.md.
# =============================================================================
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.prod"
CONFIG_DIR="${GMM_CONFIG_DIR:-/root/.config/guiamedicamonagas}"
PASSPHRASE_FILE="${GMM_BACKUP_PASSPHRASE_FILE:-${CONFIG_DIR}/backup-passphrase}"
CONFIRM_FILE="${CONFIG_DIR}/escrow-confirmed"
OUT_DIR="${GMM_ESCROW_OUT_DIR:-/root}"

die() { echo "ERROR: $1" >&2; exit 1; }
hash16() { printf '%s' "$1" | sha256sum | cut -c1-16; }

# Lo que se custodia, en formato CLAVE=valor (tal como está en el servidor).
current_material() {
  [[ -r "${ENV_FILE}" ]] || die "no se puede leer ${ENV_FILE}"
  [[ -r "${PASSPHRASE_FILE}" ]] || die "no se puede leer ${PASSPHRASE_FILE}"
  grep -E '^(DATA_ENCRYPTION_KEYS|DATA_ENCRYPTION_ACTIVE_KEY|DATA_LOOKUP_KEY)=' "${ENV_FILE}"
  echo "GMM_BACKUP_PASSPHRASE=$(head -n1 "${PASSPHRASE_FILE}" | tr -d '\r\n')"
}

# Huellas de un texto CLAVE=valor leído de la entrada estándar.
fingerprints_of() {
  local text entry entries
  text="$(cat)"
  value() { grep -E "^$1=" <<< "${text}" | tail -1 | cut -d= -f2- | sed -E "s/^['\"](.*)['\"]$/\1/"; }
  IFS=',' read -r -a entries <<< "$(value DATA_ENCRYPTION_KEYS)"
  (( ${#entries[@]} )) || die "no hay DATA_ENCRYPTION_KEYS"
  for entry in "${entries[@]}"; do
    printf 'DATA_ENCRYPTION_KEYS[%s] %s\n' "${entry%%:*}" "$(hash16 "${entry}")"
  done
  [[ -n "$(value DATA_LOOKUP_KEY)" ]] || die "no hay DATA_LOOKUP_KEY"
  printf 'DATA_LOOKUP_KEY %s\n' "$(hash16 "$(value DATA_LOOKUP_KEY)")"
  [[ -n "$(value GMM_BACKUP_PASSPHRASE)" ]] || die "no hay GMM_BACKUP_PASSPHRASE"
  printf 'GMM_BACKUP_PASSPHRASE %s\n' "$(hash16 "$(value GMM_BACKUP_PASSPHRASE)")"
}

require_terminal() {
  [[ -t 0 ]] || die "este paso es interactivo: ejecútalo en una terminal (ssh -t gmm-vps 'bash ${PROJECT_DIR}/scripts/key-escrow.sh $1')"
}

case "${1:-}" in
  fingerprints)
    current_material | fingerprints_of
    ;;

  export)
    require_terminal export
    WITH_ENV=false
    [[ "${2:-}" == "--with-env" ]] && WITH_ENV=true
    read -r -s -p "Frase para cifrar la copia (mínimo 16 caracteres; no se guarda en ningún lado): " p1; echo
    read -r -s -p "Repítela: " p2; echo
    [[ "${p1}" == "${p2}" ]] || die "las frases no coinciden"
    (( ${#p1} >= 16 )) || die "la frase debe tener al menos 16 caracteres"
    umask 077
    OUT="${OUT_DIR}/gmm-custodia-$(date -u +%Y%m%dT%H%M%SZ).txt.gpg"
    {
      echo "# Custodia de claves de Guía Médica Monagas — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "# Guardar FUERA del servidor: gestor de contraseñas y una copia sin conexión."
      echo "# Sin estas claves no se pueden leer los datos cifrados ni abrir los respaldos."
      echo "# Recuperación: docs/operations/respaldos-y-restauracion.md"
      current_material
      echo "#"
      echo "# Huellas (comprobar con: scripts/key-escrow.sh verify <archivo>):"
      current_material | fingerprints_of | sed 's/^/# /'
      if [[ "${WITH_ENV}" == true ]]; then
        echo "#"
        echo "# .env.prod completo (para reconstruir el servidor):"
        sed 's/^/ENV: /' "${ENV_FILE}"
      fi
    } | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
          --symmetric --cipher-algo AES256 -o "${OUT}" 3<<< "${p1}"
    echo "Copia cifrada: ${OUT}"
    echo "1. Descárgala a tu equipo:      scp gmm-vps:${OUT} ."
    echo "2. Bórrala del servidor:        ssh gmm-vps 'shred -u ${OUT}'"
    echo "3. Guárdala en dos lugares fuera del servidor y anota la frase en tu gestor de contraseñas."
    echo "4. Compruébala y confirma:      scripts/key-escrow.sh verify <archivo>  y  scripts/key-escrow.sh confirm"
    ;;

  verify)
    require_terminal verify
    FILE="${2:-}"
    [[ -r "${FILE}" ]] || die "indica el archivo de custodia: scripts/key-escrow.sh verify <archivo>"
    read -r -s -p "Frase de la copia: " p; echo
    PLAIN="$(gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d "${FILE}" 3<<< "${p}")" \
      || die "no se pudo abrir la copia (¿frase correcta?)"
    if diff <(current_material | fingerprints_of) <(fingerprints_of <<< "${PLAIN}") >/dev/null; then
      echo "OK: la copia corresponde a las claves y a la frase de respaldos actuales."
    else
      echo "NO COINCIDE: la copia es de otras claves (¿se rotaron después de hacerla?). Haz una nueva con «export»."
      exit 1
    fi
    ;;

  confirm)
    require_terminal confirm
    echo "Huellas de lo que se custodia hoy:"
    current_material | fingerprints_of | sed 's/^/  /'
    read -r -p "¿Guardaste la copia fuera del servidor y comprobaste que la puedes abrir? Escribe SI: " answer
    [[ "${answer}" == "SI" ]] || die "sin confirmar"
    umask 077
    mkdir -p "${CONFIG_DIR}"
    { echo "confirmado=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; current_material | fingerprints_of; } > "${CONFIRM_FILE}"
    echo "Registrado en ${CONFIRM_FILE} (solo fecha y huellas). Si las claves cambian, deploy.sh volverá a pedir la custodia."
    ;;

  status)
    [[ -r "${CONFIRM_FILE}" ]] || { echo "Sin custodia confirmada."; exit 1; }
    if diff <(current_material | fingerprints_of) <(grep -v '^confirmado=' "${CONFIRM_FILE}") >/dev/null; then
      echo "Custodia vigente ($(grep '^confirmado=' "${CONFIRM_FILE}" | cut -d= -f2))."
    else
      echo "La custodia confirmada es de otras claves: rehacerla (export, verify, confirm)."
      exit 2
    fi
    ;;

  *)
    sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
