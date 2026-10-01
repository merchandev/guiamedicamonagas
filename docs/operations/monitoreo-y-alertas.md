# Monitoreo y alertas

Estado: vigente desde el 2026-10-01 (ACT-0038). Un control que nadie mira no avisa: por eso hay tres capas y al
menos una debe llegar al teléfono del titular.

## Qué se vigila y quién avisa

| Capa | Dónde corre | Qué detecta | Cómo avisa |
|---|---|---|---|
| [`scripts/healthcheck.sh`](../../scripts/healthcheck.sh) | El servidor, cada 5 minutos (cron) | API y web por Caddy; el dominio con HTTPS por Traefik; base de datos, almacenamiento, antivirus y SMTP vistos desde la API; más de 3 correos sin entregar en una hora; contenedores detenidos o *unhealthy*; disco > 80 %; memoria < 10 %; respaldo diario > 26 h; copia externa > 26 h; prueba de restauración fallida o con más de 8 días; certificado con menos de 14 días | Los canales de `alerts.env` (abajo). Avisa al cambiar el estado y repite cada 12 h lo que siga fallando |
| «Interruptor de hombre muerto» (`GMM_HEARTBEAT_URL`) | Un servicio externo (healthchecks.io, Better Stack, Uptime Kuma…) | El servidor entero caído, sin red o con el cron detenido: el servidor deja de «dar señales» | El propio servicio externo (correo, Telegram, app) |
| Flujo [«Disponibilidad»](../../.github/workflows/disponibilidad.yml) de GitHub | GitHub, cada 30 minutos | El sitio, el directorio o la API no responden desde Internet; certificado con menos de 14 días | Correo de GitHub a quien mantiene el flujo |

Los avisos solo dicen **qué** falla («El antivirus no responde a la API»): nunca llevan datos de pacientes,
direcciones internas ni secretos.

## Configurar los canales (una sola vez, en el servidor)

Crear `/root/.config/guiamedicamonagas/alerts.env` con permisos `600` y **al menos un canal**. Mientras no exista,
`deploy.sh` lo marca como NO-GO y las alertas solo quedan en `/var/log/guiamedicamonagas/health.log`.

```bash
install -d -m 700 /root/.config/guiamedicamonagas
install -m 600 /dev/null /root/.config/guiamedicamonagas/alerts.env
nano /root/.config/guiamedicamonagas/alerts.env
```

| Canal | Variables | Cómo obtenerlas |
|---|---|---|
| **Telegram** (recomendado: llega al teléfono) | `GMM_ALERT_TELEGRAM_BOT_TOKEN`, `GMM_ALERT_TELEGRAM_CHAT_ID` | En Telegram, escribir a `@BotFather` → `/newbot` y copiar el token. Mandarle cualquier mensaje al bot nuevo y abrir `https://api.telegram.org/bot<TOKEN>/getUpdates`: el número de `chat.id` es el chat |
| Correo | `GMM_ALERT_EMAIL_TO` | Cualquier buzón del titular. Usa el SMTP de `.env.prod`; con Mailpit no funciona (no entrega fuera del servidor) |
| ntfy | `GMM_ALERT_NTFY_URL` (y `GMM_ALERT_NTFY_TOKEN` si el servidor ntfy lo pide) | App ntfy en el teléfono y suscripción a un tema largo y difícil de adivinar, p. ej. `https://ntfy.sh/gmm-<32 caracteres al azar>`: en ntfy.sh quien conoce el tema puede leerlo |
| Slack o Discord | `GMM_ALERT_WEBHOOK_URL`, `GMM_ALERT_WEBHOOK_FORMAT=slack` o `discord` | «Incoming webhook» del canal |
| Interruptor de hombre muerto | `GMM_HEARTBEAT_URL` | Crear un *check* en healthchecks.io (o similar) con período de 5 minutos y 15 de gracia, y activar allí sus avisos |

Ajustes opcionales: `GMM_ALERT_REPEAT_HOURS` (12) y `GMM_ALERT_MAX_FAILED_EMAILS` (3).

### Comprobar

```bash
bash /opt/guiamedicamonagas/scripts/healthcheck.sh --test     # manda un aviso de prueba y dice qué canal funcionó
bash /opt/guiamedicamonagas/scripts/healthcheck.sh --status   # muestra cada control (✔ / ✘) sin avisar
```

## Monitor externo de GitHub

- El flujo corre solo; también se lanza a mano en *Actions → Disponibilidad → Run workflow*.
- GitHub avisa por correo cuando un flujo programado falla a quien cambió por última vez su programación (la
  cuenta que subió el archivo). Revisar en *Settings → Notifications → Actions* que esté activo «Email» para los
  flujos fallidos.
- GitHub pausa los flujos programados tras 60 días sin actividad en el repositorio: si eso pasa, reactivarlo
  desde la misma pestaña.
- Es un control de respaldo: GitHub puede retrasar unos minutos las ejecuciones programadas.

## Estado de las dependencias: `/api/v1/health/ready`

La API responde `200` si la base de datos, el almacenamiento, el antivirus y el SMTP contestan (cada uno con 5 s de
límite) y `503` si alguno falla, junto con los correos sin entregar de la última hora. Solo dice qué dependencia
falla, nunca el mensaje de error. Caddy responde `404` a esa ruta desde Internet (cada consulta toca todas las
dependencias); `healthcheck.sh` la consulta entrando directo al contenedor.

## Versión publicada

`/api/v1/health` y `/version.json` dicen con qué commit se construyó cada imagen. `deploy.sh` falla si, al
terminar, producción no responde con el commit recién desplegado, y el flujo «Disponibilidad» la muestra en cada
revisión.

## Pendiente: errores de la aplicación

Hoy los errores 5xx quedan en los registros de los contenedores (`docker compose logs api`, con rotación de 10 MB × 3)
y los correos fallidos en `MessageLog`, que el monitoreo vigila. Un rastreador de errores (Sentry, GlitchTip u otro)
enviaría trazas a un tercero que pueden contener datos personales: es una decisión del titular y el proveedor
tendría que figurar en `/privacidad/proveedores`.
