# GO / NO-GO para operar con pacientes reales

Estado al 2026-09-25 (ACT-0024). `scripts/deploy.sh` imprime este informe en cada despliegue y, con
`GMM_REQUIRE_GO=true`, se niega a desplegar mientras quede algún NO-GO.

## Criterios

| Criterio | Estado | Cómo se comprueba / qué falta |
|---|---|---|
| HTTPS válido en el dominio | 🟢 GO | Let's Encrypt (Traefik, HTTP-01) para `guiamedicamonagas.com` y `www` desde el 2026-09-25; Traefik lo renueva solo |
| HTTP → HTTPS y `www` → dominio | 🟢 GO | Traefik redirige con 301; HSTS de un año en todo el dominio |
| Puerto 8088 cerrado a Internet | 🟢 GO | `CADDY_BIND_ADDRESS` retirado de `.env.prod`: 8088 solo en `127.0.0.1` |
| `COOKIE_SECURE=true` | 🟢 GO | Activado con el dominio; el smoke test exige el atributo `Secure` en la cookie de sesión |
| MFA de administradores | 🟡 Excepción | Obligatorio en producción; excepción fechada (`ADMIN_MFA_WAIVER_UNTIL`) hasta tener SMTP real |
| ClamAV activo | 🟢 GO | Obligatorio: la API no arranca sin `CLAMAV_HOST`; `deploy.sh` espera a que esté sano |
| Claves AES respaldadas fuera del VPS | 🔴 Pendiente del titular | `DATA_ENCRYPTION_KEYS`/`DATA_LOOKUP_KEY` en una bóveda propia |
| `_PatientPlaintextLegacy` no existe | 🟢 GO | `deploy.sh` falla si existe; e2e lo comprueba |
| PostgreSQL, Redis, MinIO (9000/9001), Meilisearch no expuestos | 🟢 GO | Sin puertos publicados; Mailpit solo en `127.0.0.1:18025` |
| CI y Seguridad en verde | 🟢 GO | GitHub Actions (acciones fijadas por SHA) |
| Paciente → autorización → revocación | 🟢 GO | e2e (80 comprobaciones) y smoke test en cada despliegue |
| Respaldos cifrados diarios | 🟢 GO | `scripts/backup.sh` por cron; ver [respaldos-y-restauracion.md](respaldos-y-restauracion.md) |
| Copia de respaldos fuera del servidor | 🔴 NO-GO | Definir `GMM_BACKUP_REMOTE` o copiar a almacenamiento externo |
| Prueba de restauración documentada | 🟢 GO | `scripts/restore-test.sh` semanal; resultado en `restore-tests.log` |
| Responsable legal en la Política de privacidad | 🔴 Pendiente del titular | Razón social, RIF, domicilio y correos (`frontend/src/lib/legal.ts`, `DATA_CONTROLLER`) |

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

## Plan de producción del 2026-09-24: qué quedó hecho

| ID | Tema | Estado |
|---|---|---|
| P0-01 | HTTPS y cierre de 8088 | Código listo (bind a `127.0.0.1` por defecto, Traefik); se activa con el DNS |
| P0-02 | MFA obligatorio en producción | Hecho, con excepción fechada hasta tener SMTP real |
| P1-01 | ClamAV obligatorio | Hecho |
| P1-02 | Invitaciones de organización | Hecho (`OrganizationInvitation`, alta sin organización extra) |
| P1-03 | Permisos OWNER / ADMIN / EDITOR | Hecho (`organization-roles.ts`) |
| P1-04 | Referencia de Pago Móvil atómica | Hecho (índice único parcial + 409) |
| P1-05 | ClinicalNote cifrado | Hecho (`clinicalDataEnc`, sin columnas en claro, sin endpoints) |
| P1-06 | `_PatientPlaintextLegacy` | Verificado en producción y en cada despliegue |
| P2-01 | Responsable legal | Estructura lista; faltan los datos del titular |
| P2-02 | Rotación de claves | Script `rotate-encryption-keys` probado y procedimiento documentado |
| P2-03 | Respaldos cifrados y restauración | Hecho; falta la copia externa |
| P2-04 | Actions fijadas por SHA | Hecho |
| P2-05 | Política de HIGH | Hecho ([vulnerabilidades.md](../security/vulnerabilidades.md)) |
| P2-06 | CI con ClamAV | Hecho (servicio ClamAV en CI) |
| P2-07 | Pruebas de concurrencia | Hecho (reservas y Pago Móvil) |
| P2-08 | Auditoría de descargas | Hecho (documentos, comprobantes, identidad) |
| Fase 42 | Monitoreo mínimo | Hecho (`scripts/healthcheck.sh`); falta el canal de alertas |
