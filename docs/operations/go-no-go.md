# GO / NO-GO para operar con pacientes reales

Estado al 2026-10-01 (ACT-0038). `scripts/deploy.sh` imprime este informe en cada despliegue y, con
`GMM_REQUIRE_GO=true`, se niega a desplegar mientras quede algún NO-GO. La hoja de ruta completa hasta el
lanzamiento está en [`docs/ROADMAP.md`](../ROADMAP.md).

## Controles automáticos (los revisa `deploy.sh`)

| Criterio | Estado | Cómo se comprueba / qué falta |
|---|---|---|
| HTTPS válido en el dominio | 🟢 GO | Let's Encrypt (Traefik, HTTP-01) para `guiamedicamonagas.com` y `www`; Traefik lo renueva y el monitoreo avisa con menos de 14 días |
| HTTP → HTTPS y `www` → dominio | 🟢 GO | Traefik redirige con 301; HSTS de un año en todo el dominio |
| Puerto 8088 cerrado a Internet | 🟢 GO | `CADDY_BIND_ADDRESS` en `127.0.0.1` |
| `COOKIE_SECURE=true` | 🟢 GO | El smoke test exige el atributo `Secure` en la cookie de sesión |
| Producción corre el commit desplegado | 🟢 GO | `/api/v1/health` y `/version.json` dicen el commit; `deploy.sh` falla si no coincide con el recién construido |
| ClamAV activo | 🟢 GO | Obligatorio: la API no arranca sin `CLAMAV_HOST`; el monitoreo lo consulta cada 5 minutos |
| `_PatientPlaintextLegacy` no existe | 🟢 GO | `deploy.sh` falla si existe; e2e lo comprueba |
| PostgreSQL, Redis, MinIO, Meilisearch no expuestos | 🟢 GO | Sin puertos publicados; Mailpit solo en `127.0.0.1:18025` |
| Bóveda de pacientes con código de seguridad | 🟢 GO | Solo el hash en el servidor; 15 minutos por apertura, bloqueo tras 5 fallos, auditado. Pendiente del titular: **cambiar el código**, que se compartió por chat |
| Respaldos cifrados diarios y prueba de restauración | 🟢 GO | Ver [respaldos-y-restauracion.md](respaldos-y-restauracion.md) |
| **Correo con SMTP real** | 🔴 NO-GO | Con Mailpit no llegan verificaciones, recuperaciones de contraseña ni códigos de MFA. Titular: contratar un SMTP con dominio propio (SPF, DKIM y DMARC) |
| **MFA de administradores** | 🟡 Excepción hasta el 2026-10-24 | Depende del SMTP real; desde esa fecha `deploy.sh` no despliega con `ADMIN_MFA_ENABLED=false`. Solo código por correo (sin aplicaciones de autenticación por ahora) |
| **Copia de respaldos fuera del servidor**, al día (≤ 26 h) | 🔴 NO-GO | `GMM_BACKUP_REMOTE` en `backup.env`. Titular: elegir el destino (B2, R2, S3 u otro servidor) y su credencial de solo escritura |
| **Restauración probada desde la copia externa** (≤ 35 días) | 🔴 NO-GO | `scripts/restore-test.sh --from-remote` (mensual por cron) |
| **Claves de datos y frase de respaldos custodiadas fuera del VPS** | 🔴 NO-GO | `scripts/key-escrow.sh export`, `verify` y `confirm`; vuelve a NO-GO si las claves cambian |
| **Canal de alertas** | 🔴 NO-GO | `alerts.env` con al menos un canal (Telegram, correo, ntfy, webhook o interruptor de hombre muerto); ver [monitoreo-y-alertas.md](monitoreo-y-alertas.md) |
| **Responsable legal publicado** | 🔴 NO-GO | Razón social, RIF, domicilio, responsable y correos en `DATA_CONTROLLER` (`frontend/src/lib/legal.ts`), con versión nueva de los textos afectados |

## Controles que no se pueden automatizar

| Criterio | Estado | Qué falta |
|---|---|---|
| Revisión de los textos legales por un abogado venezolano | 🔴 Pendiente del titular | Ver [ACT-0033](../../Actualizaciones.md#act-0033) |
| Plazos «en definición» (retención, baja → eliminación, reembolsos, jurisdicción) | 🔴 Pendiente del titular | `/privacidad/retencion` y `/reembolsos` con versión nueva |
| Simulacro de desastre con la copia externa y la custodia | 🔴 Pendiente | `restore-test.sh --from-remote --escrow-file …` (ver respaldos) |
| Pruebas de seguridad dinámicas (DAST / pentest) sin hallazgos altos | 🟡 Automáticas hechas | Política de rutas, IDOR/BOLA, tokens, fuerza bruta y XSS en CI; ZAP pasivo mensual. Falta el pentest humano ([alcance](../security/pruebas-de-seguridad.md)) |
| Médicos reales publicados | 🔴 Pendiente del titular | Hoy hay 0 perfiles publicados; el directorio ya explica que está empezando |
| Pago Móvil de la plataforma y video de muestra de Marca Médica | 🔴 Pendiente del titular | Administración → Pagos y Administración → Planes |
| Search Console y sitemap enviados | 🔴 Pendiente del titular | Verificación por DNS del dominio y envío de `/sitemap.xml` |

## Volver atrás (rollback)

Cada despliegue deja en `/var/backups/guiamedicamonagas/deploys.log` el commit anterior, etiqueta las imágenes previas
como `gmm-independent-{api,web}:rollback` y hace un respaldo cifrado `pre-deploy`.

1. Si la migración del despliegue fallido **no** cambió el esquema de forma incompatible:
   ```bash
   cd /opt/guiamedicamonagas
   git checkout <commit anterior de deploys.log>
   docker tag gmm-independent-api:rollback gmm-independent-api:${GMM_IMAGE_TAG}
   docker tag gmm-independent-web:rollback gmm-independent-web:${GMM_IMAGE_TAG}
   docker compose -p gmm-independent --env-file .env.prod -f docker-compose.prod.yml up -d --no-deps api web
   ```
2. Si la migración no es compatible hacia atrás, **no** volver atrás a ciegas: detener `api`/`web`, restaurar el
   respaldo `pre-deploy` primero en una base temporal (`scripts/restore-test.sh <archivo>`), verificar y después
   restaurar de forma controlada (ver respaldos-y-restauracion.md).

## Historial

El plan de producción del 2026-09-24 (P0-01 a P2-08: HTTPS, MFA, ClamAV, invitaciones y roles de organización,
referencia de Pago Móvil atómica, notas clínicas cifradas, rotación de claves, respaldos con restauración, Actions
fijadas por SHA, política de HIGH, CI con ClamAV, pruebas de concurrencia y auditoría de descargas) quedó completo
salvo lo que figura arriba como pendiente; el detalle está en [ACT-0019](../../Actualizaciones.md#act-0019).
