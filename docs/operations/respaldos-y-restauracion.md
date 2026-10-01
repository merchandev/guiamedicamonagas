# Respaldos, restauración y custodia de claves

Estado: vigente desde el 2026-09-24 (ACT-0019); copia externa, custodia de claves y simulacro de desastre desde el
2026-10-01 (ACT-0038). Servidor: VPS compartido, proyecto Compose `gmm-independent`. Monitoreo y alertas:
[monitoreo-y-alertas.md](monitoreo-y-alertas.md).

## Qué se respalda

| Qué | Frecuencia | Retención en el servidor | Script |
|---|---|---|---|
| PostgreSQL (`pg_dump -Fc`) | Diario 03:30 (Caracas) y antes de cada despliegue | 14 días | [`scripts/backup.sh`](../../scripts/backup.sh) |
| Archivos de MinIO (fotos, documentos, comprobantes) | Domingos 04:00 | 8 semanas | `scripts/backup.sh --with-files` |
| Copia de todo lo anterior **fuera del servidor** | Tras cada respaldo, si `GMM_BACKUP_REMOTE` está definido | La del destino (nunca se borra desde el servidor) | `scripts/backup.sh` |
| Prueba de restauración del último respaldo local | Lunes 04:30 | registro permanente | [`scripts/restore-test.sh`](../../scripts/restore-test.sh) |
| Prueba de restauración **desde la copia externa** | Primer lunes del mes, 05:30 | registro permanente | `scripts/restore-test.sh --from-remote` |

Las tareas están en [`scripts/cron/guiamedicamonagas`](../../scripts/cron/guiamedicamonagas); `deploy.sh` instala la
versión del repositorio en `/etc/cron.d/guiamedicamonagas` cuando cambia. Los respaldos quedan en
`/var/backups/guiamedicamonagas/` (`db/`, `files/`, `restore-tests.log`, `deploys.log`, `last-success`,
`last-remote-success`, `remote-errors.log`).

## Cifrado

- Cada respaldo se cifra con **gpg AES-256** en el mismo flujo del volcado: la base de datos nunca queda en disco sin
  cifrar, ni en el servidor ni en el destino externo.
- La frase de cifrado está en `/root/.config/guiamedicamonagas/backup-passphrase` (permisos `600`, fuera del repositorio
  y del directorio de respaldos).
- Las claves de datos (`DATA_ENCRYPTION_KEYS`, `DATA_LOOKUP_KEY`) **no** van en los respaldos: un respaldo robado no
  permite leer cédulas, teléfonos ni datos de salud.

### Instalación inicial (una sola vez, como root en el VPS)

```bash
install -d -m 700 /root/.config/guiamedicamonagas /var/backups/guiamedicamonagas /var/log/guiamedicamonagas
openssl rand -base64 48 > /root/.config/guiamedicamonagas/backup-passphrase
chmod 600 /root/.config/guiamedicamonagas/backup-passphrase
chmod +x /opt/guiamedicamonagas/scripts/*.sh
install -m 644 /opt/guiamedicamonagas/scripts/cron/guiamedicamonagas /etc/cron.d/guiamedicamonagas
```

## Regla 3-2-1: copia fuera del servidor

Hoy hay dos copias en el mismo servidor (datos vivos y respaldos cifrados). Si se pierde el VPS (falla del
proveedor, cuenta perdida, borrado, *ransomware*), se pierden las dos. La tercera copia va **fuera**, en otro
proveedor, y se configura en `/root/.config/guiamedicamonagas/backup.env` (permisos `600`):

| Opción | `GMM_BACKUP_REMOTE` | Qué hace falta |
|---|---|---|
| Almacenamiento de objetos (Backblaze B2, Cloudflare R2, Wasabi, S3…) — **recomendada** | `rclone:<remoto>:<bucket>/guiamedicamonagas` | `apt install rclone` y `rclone config` con una clave **que solo pueda escribir** (sin permiso de borrar). En el bucket: versionado o *object lock* y una regla de ciclo de vida (p. ej. borrar a los 90 días) |
| Otro servidor por SSH | `usuario@host:/ruta` | Clave SSH dedicada; en el destino, `authorized_keys` con `command="rrsync -wo /ruta"` para que solo pueda escribir |

Cómo se protege la copia:

- El servidor **solo agrega** archivos: `rclone copy --immutable` (nunca reemplaza uno existente) o `rsync` sin
  `--delete`. Con una credencial de solo escritura, un servidor comprometido no puede borrar las copias externas.
- Tras copiar, `rclone check` comprueba tamaño y hash del respaldo recién hecho; `rsync` verifica cada transferencia.
- Si la copia falla, el respaldo local sigue valiendo; el error queda en `remote-errors.log` y el monitoreo avisa si
  la copia externa tiene más de 26 h.
- Para la prueba mensual desde afuera hace falta leer el destino: si la credencial de escritura no lo permite,
  definir aparte `GMM_BACKUP_REMOTE_READ` con una credencial de **solo lectura**.

Ejemplo de `backup.env`:

```bash
GMM_BACKUP_REMOTE=rclone:b2-gmm:gmm-respaldos/guiamedicamonagas
GMM_BACKUP_REMOTE_READ=rclone:b2-gmm-lectura:gmm-respaldos/guiamedicamonagas
```

Después de configurarlo: `bash /opt/guiamedicamonagas/scripts/backup.sh` (debe terminar con «OK copia externa») y
`bash /opt/guiamedicamonagas/scripts/restore-test.sh --from-remote` (debe terminar con «OK restauración verificada
(respaldo remoto…)»).

## Custodia de las claves fuera del servidor

Sin estas tres cosas **ni la base de datos ni los respaldos se pueden recuperar**, y ninguna va en los respaldos:

1. `DATA_ENCRYPTION_KEYS` y `DATA_LOOKUP_KEY` (en `.env.prod`);
2. la frase de cifrado de los respaldos.

Deben guardarse en dos lugares fuera del servidor y separados de los respaldos: el gestor de contraseñas del titular
(Bitwarden, 1Password, KeePass…) y una copia sin conexión (impresa o en un medio guardado). Con
[`scripts/key-escrow.sh`](../../scripts/key-escrow.sh), en una terminal del servidor (`ssh -t gmm-vps`):

```bash
bash /opt/guiamedicamonagas/scripts/key-escrow.sh export      # pide una frase y crea /root/gmm-custodia-<fecha>.txt.gpg
scp gmm-vps:/root/gmm-custodia-<fecha>.txt.gpg .               # desde tu equipo: descargar
ssh gmm-vps 'shred -u /root/gmm-custodia-<fecha>.txt.gpg'      # y borrarla del servidor
bash /opt/guiamedicamonagas/scripts/key-escrow.sh verify <archivo>   # comprobar que abre y corresponde
bash /opt/guiamedicamonagas/scripts/key-escrow.sh confirm      # registrar la custodia (solo fecha y huellas)
```

`export --with-env` agrega el `.env.prod` completo, útil para reconstruir el servidor. El script nunca muestra las
claves; `fingerprints` imprime huellas (16 caracteres del SHA-256) para comparar copias. `deploy.sh` marca NO-GO
mientras no haya custodia confirmada **o si las claves cambiaron desde la última** (por ejemplo, tras una rotación).

## Prueba de restauración

`scripts/restore-test.sh`:

1. con `--from-remote`, descarga el último respaldo de la copia externa a una carpeta temporal;
2. verifica el sha256 del respaldo contra su manifiesto y lo descifra en un directorio temporal privado;
3. lo restaura en un PostgreSQL desechable, en una red Docker interna sin puertos publicados;
4. compara los conteos de filas con el manifiesto;
5. con la imagen de la API y las claves descifra **todos** los campos cifrados; con claves al azar comprueba que
   **ninguno** se puede leer;
6. elimina todo y deja el resultado en `restore-tests.log` (`origen=local|remoto`, `claves=servidor|custodia`).

Un respaldo sin una prueba de restauración correcta en los últimos 8 días genera una alerta; sin una prueba correcta
**desde la copia externa** en los últimos 35 días, `deploy.sh` marca NO-GO.

## Simulacro de desastre (al menos una vez antes de operar con pacientes reales)

Demuestra que se puede recuperar todo **solo con lo que está fuera del servidor**: la copia externa y la custodia.

```bash
gpg -d gmm-custodia-<fecha>.txt.gpg > /root/custodia.txt   # pide la frase de la custodia
bash /opt/guiamedicamonagas/scripts/restore-test.sh --from-remote --escrow-file /root/custodia.txt
shred -u /root/custodia.txt
```

El resultado queda en `restore-tests.log` con `origen=remoto claves=custodia`.

## Restauración real (desastre)

1. Detener el tráfico: `docker compose ... stop web api`.
2. Traer el respaldo (de `/var/backups/guiamedicamonagas/db/` o de la copia externa) y descifrarlo:
   `gpg --pinentry-mode loopback --passphrase-file <frase> -o db.dump -d gmm-db-<fecha>.dump.gpg`.
3. Restaurar primero en una base temporal y verificar (como hace `restore-test.sh`).
4. Restaurar sobre la base real (`pg_restore --clean --if-exists --no-owner`) solo después de verificar.
5. Arrancar `api` con las **mismas** claves de datos (las de `.env.prod` o las de la custodia) y comprobar.
6. Los archivos de MinIO: descifrar el último `gmm-files-<fecha>.tar.gz.gpg` y descomprimirlo en el volumen
   `gmm-independent_miniodata` con los servicios detenidos.
