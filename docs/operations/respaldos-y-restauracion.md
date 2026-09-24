# Respaldos, restauración y monitoreo

Estado: vigente desde el 2026-09-24 (ACT-0019). Servidor: VPS compartido, proyecto Compose `gmm-independent`.

## Qué se respalda

| Qué | Frecuencia | Retención | Script |
|---|---|---|---|
| PostgreSQL (`pg_dump -Fc`) | Diario 03:30 (Caracas) y antes de cada despliegue | 14 días | [`scripts/backup.sh`](../../scripts/backup.sh) |
| Archivos de MinIO (fotos, documentos, comprobantes) | Domingos 04:00 | 8 semanas | `scripts/backup.sh --with-files` |
| Prueba de restauración del último respaldo | Lunes 04:30 | registro permanente | [`scripts/restore-test.sh`](../../scripts/restore-test.sh) |

Las tareas están en [`scripts/cron/guiamedicamonagas`](../../scripts/cron/guiamedicamonagas), instalado en
`/etc/cron.d/guiamedicamonagas`. Los respaldos quedan en `/var/backups/guiamedicamonagas/` (`db/`, `files/`,
`restore-tests.log`, `deploys.log`, `last-success`).

## Cifrado y custodia

- Cada respaldo se cifra con **gpg AES-256** en el mismo flujo del volcado: la base de datos nunca queda en disco sin cifrar.
- La frase de cifrado está en `/root/.config/guiamedicamonagas/backup-passphrase` (permisos `600`, fuera del repositorio
  y del directorio de respaldos). **Debe guardarse también fuera del VPS**: sin ella los respaldos no se pueden abrir.
- Las claves de datos (`DATA_ENCRYPTION_KEYS`, `DATA_LOOKUP_KEY`) **no** van en los respaldos. Un respaldo robado no
  permite leer cédulas, teléfonos ni datos de salud. Por eso hay que custodiar por separado:
  1. la frase de cifrado de los respaldos, y
  2. las claves de datos de `.env.prod`.

### Instalación inicial (una sola vez, como root en el VPS)

```bash
install -d -m 700 /root/.config/guiamedicamonagas /var/backups/guiamedicamonagas /var/log/guiamedicamonagas
openssl rand -base64 48 > /root/.config/guiamedicamonagas/backup-passphrase
chmod 600 /root/.config/guiamedicamonagas/backup-passphrase
chmod +x /opt/guiamedicamonagas/scripts/*.sh
install -m 644 /opt/guiamedicamonagas/scripts/cron/guiamedicamonagas /etc/cron.d/guiamedicamonagas
```

## Regla 3-2-1 (pendiente)

Hoy hay dos copias en el mismo servidor (datos vivos y respaldos cifrados). Falta **la copia fuera del servidor**:
basta con definir `GMM_BACKUP_REMOTE=usuario@host:/ruta` en el entorno de cron (destino rsync por SSH) o copiar
periódicamente `/var/backups/guiamedicamonagas/` a un almacenamiento externo. Mientras falte, `deploy.sh` lo marca
como NO-GO.

## Prueba de restauración

`scripts/restore-test.sh`:

1. verifica el sha256 del respaldo contra su manifiesto y lo descifra en un directorio temporal privado;
2. lo restaura en un PostgreSQL desechable, en una red Docker interna sin puertos publicados;
3. compara los conteos de filas con el manifiesto;
4. con la imagen de la API y las claves de producción descifra **todos** los campos cifrados; con claves al azar
   comprueba que **ninguno** se puede leer;
5. elimina todo y deja el resultado en `restore-tests.log`.

Un respaldo sin una prueba de restauración correcta en los últimos 8 días genera una alerta.

## Restauración real (desastre)

1. Detener el tráfico: `docker compose ... stop web api`.
2. Descifrar: `gpg --pinentry-mode loopback --passphrase-file <frase> -o db.dump -d gmm-db-<fecha>.dump.gpg`.
3. Restaurar primero en una base temporal y verificar (como hace `restore-test.sh`).
4. Restaurar sobre la base real (`pg_restore --clean --if-exists --no-owner`) solo después de verificar.
5. Arrancar `api` con el **mismo** `.env.prod` (mismas claves de datos) y comprobar.

## Monitoreo

[`scripts/healthcheck.sh`](../../scripts/healthcheck.sh) corre cada 5 minutos y revisa:

- la API a través de Caddy;
- los contenedores del proyecto (en marcha y sanos);
- el disco (> 80 %) y la memoria (< 10 % disponible);
- el último respaldo (> 26 h) y la última restauración correcta (> 8 días);
- el certificado del dominio (< 14 días), en cuanto Traefik sirva uno real.

Registra solo los cambios de estado en `/var/log/guiamedicamonagas/health.log`. Para recibir avisos hay que crear
`/root/.config/guiamedicamonagas/alerts.env` con `GMM_ALERT_WEBHOOK_URL=` (un webhook de Slack, Discord o ntfy).
Mientras no exista, las alertas solo quedan en el log.
