#!/usr/bin/env bash
# =============================================================================
# Monitoreo mínimo de Guía Médica Monagas (cron cada 5 minutos).
#
# Revisa: salud de la API a través de Caddy, estado de los contenedores del
# proyecto, disco, memoria, antigüedad del último respaldo y de la última
# prueba de restauración, y vencimiento del certificado cuando el dominio ya
# tenga uno real. Escribe solo los cambios de estado (alerta nueva / resuelta)
# en /var/log/guiamedicamonagas/health.log y, si existe
# /root/.config/guiamedicamonagas/alerts.env con GMM_ALERT_WEBHOOK_URL, envía
# ahí cada cambio (JSON {"text": ...}, compatible con Slack, Discord o ntfy).
# =============================================================================
set -uo pipefail

PROJECT_NAME="gmm-independent"
STATE_DIR="/var/lib/guiamedicamonagas"
LOG_DIR="/var/log/guiamedicamonagas"
BACKUP_ROOT="${GMM_BACKUP_DIR:-/var/backups/guiamedicamonagas}"
ALERTS_ENV="/root/.config/guiamedicamonagas/alerts.env"
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${STATE_DIR}" "${LOG_DIR}"
[[ -r "${ALERTS_ENV}" ]] && source "${ALERTS_ENV}"

problems=()

# API detrás de Caddy (mismo camino que el tráfico real)
curl -sf -m 10 -o /dev/null http://127.0.0.1:8088/api/v1/health || problems+=("La API no responde en /api/v1/health")

# Contenedores del proyecto: todos en marcha y sanos
while read -r name state health; do
  [[ -z "${name}" ]] && continue
  if [[ "${state}" != "running" ]]; then problems+=("Contenedor ${name}: ${state}")
  elif [[ "${health}" == "unhealthy" ]]; then problems+=("Contenedor ${name}: unhealthy"); fi
done < <(docker ps -a --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
  --format '{{.Names}} {{.State}} {{if .Status}}{{.Status}}{{end}}' \
  | awk '{ h = ($0 ~ /\(unhealthy\)/) ? "unhealthy" : "ok"; print $1, $2, h }')

# Disco y memoria
disk="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
(( disk > 80 )) && problems+=("Disco al ${disk}%")
mem_avail_pct="$(awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {printf "%d", a*100/t}' /proc/meminfo)"
(( mem_avail_pct < 10 )) && problems+=("Memoria disponible al ${mem_avail_pct}%")

# Respaldos: el diario no puede tener más de 26 h; la prueba de restauración, más de 8 días
if [[ -r "${BACKUP_ROOT}/last-success" ]]; then
  age_h=$(( ( $(date -u +%s) - $(date -u -d "$(cat "${BACKUP_ROOT}/last-success")" +%s) ) / 3600 ))
  (( age_h > 26 )) && problems+=("Último respaldo hace ${age_h} h")
else
  problems+=("No hay registro de respaldos")
fi
last_restore="$(grep ' OK ' "${BACKUP_ROOT}/restore-tests.log" 2>/dev/null | tail -1 | cut -d' ' -f1)"
if [[ -n "${last_restore}" ]]; then
  age_d=$(( ( $(date -u +%s) - $(date -u -d "${last_restore}" +%s) ) / 86400 ))
  (( age_d > 8 )) && problems+=("Última prueba de restauración correcta hace ${age_d} días")
else
  problems+=("Sin prueba de restauración correcta registrada")
fi

# Certificado del dominio (solo cuando Traefik ya sirve uno real)
domain="$(grep -E '^GMM_DOMAIN=' "${PROJECT_DIR}/.env.prod" 2>/dev/null | cut -d= -f2)"
if [[ -n "${domain}" ]]; then
  cert="$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "${domain}" 2>/dev/null | openssl x509 -noout -issuer -enddate 2>/dev/null)"
  if [[ -n "${cert}" && "${cert}" != *"TRAEFIK DEFAULT CERT"* ]]; then
    end="$(sed -n 's/^notAfter=//p' <<< "${cert}")"
    days=$(( ( $(date -u -d "${end}" +%s) - $(date -u +%s) ) / 86400 ))
    (( days < 14 )) && problems+=("El certificado de ${domain} vence en ${days} días")
  fi
fi

# Solo se registra y se avisa cuando el estado cambia
current="$(printf '%s\n' "${problems[@]}" | sort)"
previous="$(cat "${STATE_DIR}/health.state" 2>/dev/null)"
if [[ "${current}" != "${previous}" ]]; then
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if (( ${#problems[@]} )); then
    message="ALERTA Guía Médica Monagas: $(printf '%s; ' "${problems[@]}")"
  else
    message="OK Guía Médica Monagas: todo en orden de nuevo"
  fi
  echo "${now} ${message}" >> "${LOG_DIR}/health.log"
  if [[ -n "${GMM_ALERT_WEBHOOK_URL:-}" ]]; then
    curl -sf -m 10 -H 'content-type: application/json' \
      -d "$(jq -n --arg text "${message}" '{text: $text}')" "${GMM_ALERT_WEBHOOK_URL}" >/dev/null || true
  fi
  printf '%s' "${current}" > "${STATE_DIR}/health.state"
fi
exit 0
