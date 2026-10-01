#!/usr/bin/env bash
# =============================================================================
# Monitoreo de Guía Médica Monagas (cron cada 5 minutos).
#
#   scripts/healthcheck.sh            # revisa y avisa cuando algo cambia
#   scripts/healthcheck.sh --status   # muestra cada control, sin avisar
#   scripts/healthcheck.sh --test     # manda un aviso de prueba por cada canal
#
# Controles: API y web a través de Caddy; el dominio con HTTPS a través de
# Traefik; base de datos, almacenamiento, antivirus y correo (desde la propia
# API); correos que no se entregan; contenedores; disco y memoria; respaldo
# diario, copia externa y prueba de restauración; vencimiento del certificado.
#
# Avisa solo los cambios de estado (alerta nueva / resuelta) y repite cada
# GMM_ALERT_REPEAT_HOURS (12 h) lo que siga fallando. Los canales se
# configuran en /root/.config/guiamedicamonagas/alerts.env (fuera del repo):
#
#   GMM_ALERT_TELEGRAM_BOT_TOKEN + GMM_ALERT_TELEGRAM_CHAT_ID   Telegram
#   GMM_ALERT_EMAIL_TO          correo (usa el SMTP de .env.prod; no con Mailpit)
#   GMM_ALERT_NTFY_URL          ntfy (https://ntfy.sh/<tema-secreto>), opcional GMM_ALERT_NTFY_TOKEN
#   GMM_ALERT_WEBHOOK_URL       Slack o Discord (GMM_ALERT_WEBHOOK_FORMAT=slack|discord)
#   GMM_HEARTBEAT_URL           «interruptor de hombre muerto» (healthchecks.io,
#                               Better Stack, Uptime Kuma…): se llama solo si todo
#                               está bien; si el servidor cae, el servicio avisa.
#
# Ver docs/operations/monitoreo-y-alertas.md.
# =============================================================================
set -uo pipefail

MODE="${1:-check}"
case "${MODE}" in check|--status|--test) ;; *) echo "Uso: $0 [--status|--test]" >&2; exit 2 ;; esac

PROJECT_NAME="gmm-independent"
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.prod"
CONFIG_DIR="/root/.config/guiamedicamonagas"
STATE_DIR="/var/lib/guiamedicamonagas"
LOG_DIR="/var/log/guiamedicamonagas"
BACKUP_ROOT="${GMM_BACKUP_DIR:-/var/backups/guiamedicamonagas}"
mkdir -p "${STATE_DIR}" "${LOG_DIR}"
[[ -r "${CONFIG_DIR}/alerts.env" ]] && source "${CONFIG_DIR}/alerts.env"
[[ -r "${CONFIG_DIR}/backup.env" ]] && source "${CONFIG_DIR}/backup.env"

# Lee una variable de .env.prod sin ejecutar el archivo (quita comillas simples o dobles).
envval() { grep -E "^$1=" "${ENV_FILE}" 2>/dev/null | tail -1 | cut -d= -f2- | sed -E "s/^['\"](.*)['\"]$/\1/"; }

CADDY_PORT="$(envval CADDY_PORT)"; CADDY_PORT="${CADDY_PORT:-8088}"
DOMAIN="$(envval GMM_DOMAIN)"
REPEAT_HOURS="${GMM_ALERT_REPEAT_HOURS:-12}"
MAX_FAILED_EMAILS="${GMM_ALERT_MAX_FAILED_EMAILS:-3}"

problems=()
ok()  { [[ "${MODE}" == "--status" ]] && printf '  ✔ %s\n' "$1"; return 0; }
bad() { problems+=("$1"); [[ "${MODE}" == "--status" ]] && printf '  ✘ %s\n' "$1"; return 0; }

# --- Canales de aviso -----------------------------------------------------------
# Los secretos (token, contraseña) viajan a curl por la entrada estándar (-K -),
# no como argumentos: así no aparecen en la lista de procesos.
send_telegram() {
  [[ -n "${GMM_ALERT_TELEGRAM_BOT_TOKEN:-}" && -n "${GMM_ALERT_TELEGRAM_CHAT_ID:-}" ]] || return 2
  curl -sf -m 20 -o /dev/null -K - --data-urlencode "chat_id=${GMM_ALERT_TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$1" <<< "url = \"https://api.telegram.org/bot${GMM_ALERT_TELEGRAM_BOT_TOKEN}/sendMessage\""
}
send_ntfy() {
  [[ -n "${GMM_ALERT_NTFY_URL:-}" ]] || return 2
  # El nombre del tema es el secreto del canal: también va por la entrada estándar.
  local config="url = \"${GMM_ALERT_NTFY_URL}\""
  [[ -n "${GMM_ALERT_NTFY_TOKEN:-}" ]] && config+=$'\n'"header = \"Authorization: Bearer ${GMM_ALERT_NTFY_TOKEN}\""
  curl -sf -m 20 -o /dev/null -K - -H "Title: Guia Medica Monagas" -H "Priority: high" -H "Tags: rotating_light" \
    --data-binary "$1" <<< "${config}"
}
send_webhook() {
  [[ -n "${GMM_ALERT_WEBHOOK_URL:-}" ]] || return 2
  local key=text
  [[ "${GMM_ALERT_WEBHOOK_FORMAT:-slack}" == "discord" ]] && key=content
  curl -sf -m 20 -o /dev/null -K - -H 'content-type: application/json' \
    -d "$(jq -n --arg k "${key}" --arg v "$1" '{($k): $v}')" <<< "url = \"${GMM_ALERT_WEBHOOK_URL}\""
}
send_email() {
  [[ -n "${GMM_ALERT_EMAIL_TO:-}" ]] || return 2
  local host port secure user pass from scheme mail tls=()
  host="$(envval SMTP_HOST)"; port="$(envval SMTP_PORT)"; secure="$(envval SMTP_SECURE)"
  user="$(envval SMTP_USER)"; pass="$(envval SMTP_PASS)"; from="$(envval MAIL_FROM)"
  # Mailpit solo atrapa los correos dentro del servidor: no sirve para avisar.
  [[ -n "${host}" && "${host}" != "mailpit" ]] || return 3
  from="$(sed -E 's/.*<([^>]+)>.*/\1/' <<< "${from}")"
  if [[ "${secure}" == "true" || "${port}" == "465" ]]; then scheme=smtps; else scheme=smtp; tls=(--ssl-reqd); fi
  mail="$(mktemp)"; chmod 600 "${mail}"
  {
    printf 'From: Monitoreo Guia Medica Monagas <%s>\r\n' "${from}"
    printf 'To: %s\r\n' "${GMM_ALERT_EMAIL_TO}"
    printf 'Subject: =?UTF-8?B?%s?=\r\n' "$(printf '%s' "${1%%:*}" | base64 -w0)"
    printf 'Date: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n' "$(date -R)"
    printf '%s\r\n' "$1"
  } > "${mail}"
  local auth=""
  [[ -n "${user}" ]] && auth="user = \"${user}:${pass}\""
  curl -sf -m 40 --url "${scheme}://${host}:${port:-587}" "${tls[@]}" --mail-from "${from}" \
    --mail-rcpt "${GMM_ALERT_EMAIL_TO}" -T "${mail}" -K - <<< "${auth}"
  local rc=$?
  rm -f "${mail}"
  return "${rc}"
}

# Envía a todos los canales configurados; imprime cuáles funcionaron (sin secretos).
notify() {
  local sent=0 name rc
  for name in telegram email ntfy webhook; do
    "send_${name}" "$1"; rc=$?
    case "${rc}" in
      0) sent=$((sent + 1)); [[ "${MODE}" == "--test" ]] && echo "  ✔ ${name}" ;;
      2) ;; # no configurado
      3) [[ "${MODE}" == "--test" ]] && echo "  – ${name}: el SMTP es Mailpit (no entrega fuera del servidor)" ;;
      *) [[ "${MODE}" == "--test" ]] && echo "  ✘ ${name}: no se pudo enviar (código ${rc})"
         echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) no se pudo avisar por ${name}" >> "${LOG_DIR}/health.log" ;;
    esac
  done
  return $(( sent > 0 ? 0 : 1 ))
}

if [[ "${MODE}" == "--test" ]]; then
  echo "Aviso de prueba:"
  if notify "PRUEBA Guía Médica Monagas: el canal de alertas del servidor funciona ($(date -u +%Y-%m-%dT%H:%M:%SZ))."; then
    rc=0
  else
    echo "  Ningún canal entregó el aviso: revisa ${CONFIG_DIR}/alerts.env (ver docs/operations/monitoreo-y-alertas.md)."; rc=1
  fi
  if [[ -n "${GMM_HEARTBEAT_URL:-}" ]]; then
    curl -sf -m 15 -o /dev/null -K - <<< "url = \"${GMM_HEARTBEAT_URL}\"" && echo "  ✔ heartbeat" || echo "  ✘ heartbeat"
  fi
  exit "${rc}"
fi

[[ "${MODE}" == "--status" ]] && echo "Controles de $(hostname) — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- Sitio ---------------------------------------------------------------------
# API y web por Caddy (el mismo camino que el tráfico real, sin Traefik).
if curl -sf -m 10 -o /dev/null "http://127.0.0.1:${CADDY_PORT}/api/v1/health"; then ok "API"; else bad "La API no responde en /api/v1/health"; fi
if curl -sf -m 10 -o /dev/null "http://127.0.0.1:${CADDY_PORT}/version.json"; then ok "Web"; else bad "La web no responde"; fi
# El dominio con HTTPS, por Traefik, sin depender del DNS.
if [[ -n "${DOMAIN}" ]]; then
  if curl -sf -m 15 -o /dev/null --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/v1/health"; then
    ok "https://${DOMAIN}"
  else
    bad "https://${DOMAIN} no responde por Traefik"
  fi
fi

# --- Dependencias, vistas desde la API -------------------------------------------
API_CONTAINER="$(docker ps -q --filter "label=com.docker.compose.project=${PROJECT_NAME}" --filter label=com.docker.compose.service=api | head -n1)"
if [[ -n "${API_CONTAINER}" ]]; then
  READY="$(docker exec "${API_CONTAINER}" node -e "fetch('http://127.0.0.1:4000/api/v1/health/ready').then((r) => r.text()).then((t) => process.stdout.write(t)).catch(() => process.exit(1))" 2>/dev/null)"
  if jq -e '.checks' >/dev/null 2>&1 <<< "${READY}"; then
    declare -A NAMES=([database]="La base de datos" [storage]="El almacenamiento de archivos" [antivirus]="El antivirus" [mail]="El servidor de correo")
    for dep in database storage antivirus mail; do
      case "$(jq -r ".checks.${dep}" <<< "${READY}")" in
        ok) ok "${NAMES[$dep]}" ;;
        off) ok "${NAMES[$dep]} (no configurado)" ;;
        *) bad "${NAMES[$dep]} no responde a la API" ;;
      esac
    done
    failed="$(jq -r '.failedEmailsLastHour // 0' <<< "${READY}")"
    if (( failed > MAX_FAILED_EMAILS )); then bad "${failed} correos sin entregar en la última hora"; else ok "Correos sin entregar en la última hora: ${failed}"; fi
  else
    bad "La API no informa el estado de sus dependencias"
  fi
fi

# --- Contenedores del proyecto: en marcha y sanos --------------------------------
container_problems=0
while read -r name state health; do
  [[ -z "${name}" ]] && continue
  if [[ "${state}" != "running" ]]; then bad "Contenedor ${name}: ${state}"; container_problems=1
  elif [[ "${health}" == "unhealthy" ]]; then bad "Contenedor ${name}: unhealthy"; container_problems=1; fi
done < <(docker ps -a --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
  --format '{{.Names}} {{.State}} {{if .Status}}{{.Status}}{{end}}' \
  | awk '{ h = ($0 ~ /\(unhealthy\)/) ? "unhealthy" : "ok"; print $1, $2, h }')
(( container_problems )) || ok "Contenedores en marcha y sanos"

# --- Disco y memoria ---------------------------------------------------------------
disk="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if (( disk > 80 )); then bad "Disco al ${disk}%"; else ok "Disco al ${disk}%"; fi
mem_avail_pct="$(awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {printf "%d", a*100/t}' /proc/meminfo)"
if (( mem_avail_pct < 10 )); then bad "Memoria disponible al ${mem_avail_pct}%"; else ok "Memoria disponible al ${mem_avail_pct}%"; fi

# --- Respaldos ---------------------------------------------------------------------
hours_since() { echo $(( ( $(date -u +%s) - $(date -u -d "$1" +%s) ) / 3600 )); }
if [[ -r "${BACKUP_ROOT}/last-success" ]]; then
  age_h="$(hours_since "$(cat "${BACKUP_ROOT}/last-success")")"
  if (( age_h > 26 )); then bad "Último respaldo hace ${age_h} h"; else ok "Último respaldo hace ${age_h} h"; fi
else
  bad "No hay registro de respaldos"
fi
# Copia fuera del servidor: solo se vigila cuando está configurada (si falta,
# lo señala el informe GO / NO-GO de cada despliegue).
if [[ -n "${GMM_BACKUP_REMOTE:-}" ]]; then
  if [[ -r "${BACKUP_ROOT}/last-remote-success" ]]; then
    age_h="$(hours_since "$(cat "${BACKUP_ROOT}/last-remote-success")")"
    if (( age_h > 26 )); then bad "Última copia externa de respaldos hace ${age_h} h"; else ok "Última copia externa hace ${age_h} h"; fi
  else
    bad "La copia externa de respaldos está configurada pero nunca se completó"
  fi
fi
last_test="$(tail -n1 "${BACKUP_ROOT}/restore-tests.log" 2>/dev/null)"
if [[ "${last_test}" == *" FAIL "* ]]; then
  bad "La última prueba de restauración falló: $(cut -d' ' -f4- <<< "${last_test}")"
fi
last_restore="$(grep ' OK ' "${BACKUP_ROOT}/restore-tests.log" 2>/dev/null | tail -1 | cut -d' ' -f1)"
if [[ -n "${last_restore}" ]]; then
  age_d=$(( $(hours_since "${last_restore}") / 24 ))
  if (( age_d > 8 )); then bad "Última prueba de restauración correcta hace ${age_d} días"; else ok "Última prueba de restauración correcta hace ${age_d} días"; fi
else
  bad "Sin prueba de restauración correcta registrada"
fi

# --- Certificado del dominio (solo cuando Traefik ya sirve uno real) ---------------
if [[ -n "${DOMAIN}" ]]; then
  cert="$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "${DOMAIN}" 2>/dev/null | openssl x509 -noout -issuer -enddate 2>/dev/null)"
  if [[ -n "${cert}" && "${cert}" != *"TRAEFIK DEFAULT CERT"* ]]; then
    end="$(sed -n 's/^notAfter=//p' <<< "${cert}")"
    days=$(( ( $(date -u -d "${end}" +%s) - $(date -u +%s) ) / 86400 ))
    if (( days < 14 )); then bad "El certificado de ${DOMAIN} vence en ${days} días"; else ok "Certificado válido por ${days} días"; fi
  fi
fi

if [[ "${MODE}" == "--status" ]]; then
  (( ${#problems[@]} )) && exit 1 || exit 0
fi

# --- Avisos: cambios de estado y recordatorio de lo que sigue fallando ------------
# Sin problemas, se avisa al servicio externo de que el servidor sigue vivo.
if (( ${#problems[@]} == 0 )) && [[ -n "${GMM_HEARTBEAT_URL:-}" ]]; then
  curl -sf -m 15 -o /dev/null -K - <<< "url = \"${GMM_HEARTBEAT_URL}\"" || true
fi

now_epoch="$(date -u +%s)"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
current="$(printf '%s\n' "${problems[@]}" | sort)"
previous="$(cat "${STATE_DIR}/health.state" 2>/dev/null)"
last_notice="$(cat "${STATE_DIR}/health.notified" 2>/dev/null || echo 0)"

message=""
if [[ "${current}" != "${previous}" ]]; then
  if (( ${#problems[@]} )); then
    message="ALERTA Guía Médica Monagas: $(printf '%s; ' "${problems[@]}")"
  else
    message="OK Guía Médica Monagas: todo en orden de nuevo."
  fi
  echo "${now} ${message}" >> "${LOG_DIR}/health.log"
  printf '%s' "${current}" > "${STATE_DIR}/health.state"
elif (( ${#problems[@]} )) && (( now_epoch - last_notice >= REPEAT_HOURS * 3600 )); then
  message="SIGUE FALLANDO Guía Médica Monagas: $(printf '%s; ' "${problems[@]}")"
fi

if [[ -n "${message}" ]]; then
  notify "${message}" >/dev/null
  echo "${now_epoch}" > "${STATE_DIR}/health.notified"
fi
exit 0
