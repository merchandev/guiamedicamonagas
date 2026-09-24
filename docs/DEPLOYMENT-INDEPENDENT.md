# Despliegue independiente de Guía Médica Monagas

La instalación está preparada en `/opt/guiamedicamonagas`, dentro del proyecto Docker Compose `gmm-independent`. El acceso inicial previsto es [http://72.61.77.167:8088](http://72.61.77.167:8088). Dominio, HTTPS público y SMTP de entrega real están pendientes. La verificación final de disponibilidad y comparación de los proyectos anteriores debe registrarse al cerrar el despliegue.

## Aislamiento

| Recurso | Configuración exclusiva |
|---|---|
| Directorio | `/opt/guiamedicamonagas` |
| Proyecto Compose | `gmm-independent` |
| Web y API públicas | Puerto `8088` mediante Caddy propio |
| Datos y comunicaciones internas | `gmm-independent_gmm_internal`, `172.31.77.0/24` |
| Web, API y proxy | `gmm-independent_gmm_dmz`, `172.31.78.0/24` |
| Proxy y MinIO | `gmm-independent_gmm_storage`, `172.31.79.0/24` |
| Correo de pruebas | `mailpit:1025`, dentro de la red del proyecto |
| Interfaz Mailpit | `127.0.0.1:18025`, solo loopback del servidor |
| Volúmenes | Prefijo `gmm-independent_`, incluidos datos, almacenamiento, correo y Caddy |
| Imágenes de aplicación | `gmm-independent-api` y `gmm-independent-web` |
| Builder | `gmm-build-20260923`, dedicado a esta aplicación |

Las direcciones privadas pertenecen a redes Docker diferentes. La IP pública disponible sigue siendo `72.61.77.167`; otra IP pública necesita asignación del proveedor. El puerto exclusivo permite acceder a esta aplicación con esa IP sin reutilizar los puertos web existentes.

La configuración usa credenciales, contenedores, redes, volúmenes y proxy propios. No requiere editar las aplicaciones anteriores, sus archivos ni su proxy. La comparación final del inventario, arranques, puertos y configuraciones anteriores está pendiente de verificación; el diseño aislado no sustituye esa comprobación.

## Archivos de acceso

- `/opt/guiamedicamonagas/.env.prod`: configuración privada del proyecto, permisos `600`.
- `/var/lib/gmm-deploy-20260923/admin-access.txt`: acceso administrativo generado, permisos `600`.

Estos archivos deben permanecer fuera de Git. No copiar sus valores a logs, documentación o comandos compartidos. El administrador inicial se crea con `SEED_SUPERADMIN_EMAIL` y `SEED_SUPERADMIN_PASSWORD`; el seed recibe las variables por nombre.

En el acceso HTTP temporal se configura `COOKIE_SECURE=false` y HSTS desactivado. Al habilitar HTTPS real, ajustar las URLs públicas, activar cookies seguras y volver a compilar el frontend para incorporar sus variables públicas. HSTS debe habilitarse cuando el acceso HTTPS haya sido verificado.

## Estado y registros

Ejecutar en el servidor:

```bash
cd /opt/guiamedicamonagas
docker compose -p gmm-independent --env-file .env.prod -f docker-compose.prod.yml ps
docker compose -p gmm-independent --env-file .env.prod -f docker-compose.prod.yml logs --tail=100 api web caddy
curl --fail --max-time 15 http://127.0.0.1:8088/api/v1/health
```

Los logs tienen rotación configurada y los servicios límites de CPU y memoria. Los servicios de datos no publican puertos externos.

## Actualización de este proyecto

Revisar e integrar únicamente los cambios de este repositorio en `/opt/guiamedicamonagas`; conservar las correcciones locales y `.env.prod`. Antes de una actualización con cambios de esquema, crear la copia de PostgreSQL descrita abajo.

```bash
cd /opt/guiamedicamonagas
git status --short
docker buildx inspect gmm-build-20260923
GMM_BUILDER=gmm-build-20260923 bash scripts/deploy.sh
```

El builder dedicado está limitado a **2 GB de memoria y 1,5 CPU**. `scripts/buildkitd.toml` fija `max-parallelism = 1`; el script también limita las operaciones Compose paralelas. Se debe conservar ese builder para compilar en el VPS compartido. No usar compilaciones globales ni sustituir el builder de otras aplicaciones.

`scripts/deploy.sh` resuelve su directorio independientemente del directorio de invocación y fija `--project-directory`, `--env-file .env.prod`, `-p gmm-independent` y `-f docker-compose.prod.yml` en cada comando. Su secuencia es:

1. Validar variables: además de las obligatorias, exige `CLAMAV_HOST` y MFA de administradores (`ADMIN_MFA_ENABLED=true` o una excepción `ADMIN_MFA_WAIVER_UNTIL` vigente; vencida, el despliegue se detiene).
2. Imprimir el informe **GO / NO-GO** para pacientes reales (HTTPS, cookies seguras, puerto 8088 publicado, MFA, respaldos externos, prueba de restauración). Con `GMM_REQUIRE_GO=true` cualquier NO-GO detiene el despliegue. Ver [operations/go-no-go.md](operations/go-no-go.md).
3. Respaldo cifrado previo (`scripts/backup.sh --label pre-deploy`) y punto de retorno: imágenes `gmm-independent-{api,web}:rollback` y commit anterior en `/var/backups/guiamedicamonagas/deploys.log`.
4. Descargar solo las imágenes externas necesarias y compilar API y web con el builder indicado.
5. Iniciar los servicios de datos, Mailpit y ClamAV; inicializar MinIO.
6. Aplicar migraciones con `compose run --rm --no-deps api node_modules/.bin/prisma migrate deploy` (la imagen no incluye npm/npx) y ejecutar el seed compilado `node dist/prisma/seed.js`.
7. Esperar a que ClamAV cargue sus firmas (la API rechaza subidas sin antivirus) e iniciar API, web y Caddy.
8. Verificar que la tabla temporal `_PatientPlaintextLegacy` ya no existe (si existe, el despliegue falla) y, con el Mailpit interno, ejecutar `scripts/smoke-deployment.cjs`.

Validar después el endpoint de salud, inicio de sesión, páginas con renderizado del servidor y descarga de archivos mediante URLs firmadas. Si falla una etapa, resolver el error de este proyecto antes de continuar; los scripts no ejecutan limpieza o reinicios globales.

## Copia de PostgreSQL

Los respaldos automáticos (diarios, cifrados, con prueba de restauración semanal) están descritos en [operations/respaldos-y-restauracion.md](operations/respaldos-y-restauracion.md). La copia manual de abajo sirve para una intervención puntual.

El siguiente respaldo usa exclusivamente el servicio `postgres` del proyecto y obtiene sus credenciales dentro del contenedor:

```bash
cd /opt/guiamedicamonagas
umask 077
mkdir -p /opt/guiamedicamonagas/backups
chmod 700 /opt/guiamedicamonagas/backups
backup_path="/opt/guiamedicamonagas/backups/postgres-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose -p gmm-independent --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$backup_path"
test -s "$backup_path"
```

Comprobar que `pg_dump` termine correctamente antes de considerar válida la copia. Una copia de PostgreSQL no incluye los archivos MinIO ni `.env.prod`: respaldar también esos datos exclusivos del proyecto y conservar una copia externa protegida. No ejecutar `down -v`, eliminación de volúmenes o `docker system prune`; no forman parte de este procedimiento.

## Correo temporal

Mailpit recibe los mensajes de la aplicación en `mailpit:1025`, con autenticación vacía y TLS desactivado en esta red interna. **No entrega mensajes a Internet**. Registro, recuperación y notificaciones requieren SMTP real para enviar mensajes a sus destinatarios finales.

Para consultar el buzón, abrir un túnel desde el equipo local:

```bash
ssh -L 18025:127.0.0.1:18025 root@72.61.77.167
```

Mientras el túnel esté abierto, visitar [http://127.0.0.1:18025](http://127.0.0.1:18025). El puerto no se publica en la interfaz externa del VPS.

## Fallos corregidos para este despliegue

- La etiqueta de MinIO de julio no existía en el registro utilizado; se fijó la versión oficial `RELEASE.2025-09-07T16-13-09Z`.
- La salida compilada de NestJS está en `dist/src/main.js`; se corrigió el comando de arranque. El seed de producción utiliza `dist/prisma/seed.js`.
- HSTS se hace configurable para que el acceso HTTP temporal no fuerce un HTTPS todavía inexistente.
- La caché ISR del frontend dispone de permisos de escritura para el usuario `node` del contenedor.
- Caddy y MinIO comparten una red de almacenamiento propia para que el proxy pueda servir las URLs firmadas sin conectar otros proyectos.
- MinIO se inicializa mediante el servicio Compose: política con `ListBucket` y `GetBucketLocation` para HEAD, además de acceso a los objetos de su bucket. La repetición no ignora errores reales de credenciales o permisos.
- El script despliega usando siempre `.env.prod`, inicia datos antes de migrar, separa descargas externas de compilaciones y admite el SMTP interno sin credenciales.

## Cierre verificado: 2026-09-23 06:40 VET

- Despliegue de `b6fb700` con dos ajustes adicionales: healthcheck de PostgreSQL con base de datos explícita, y Mailpit conectado también a la red no interna del proyecto para que su publicación en loopback funcione.
- Ocho servicios en ejecución. Acceso externo confirmado en http://72.61.77.167:8088/ e inicio de sesión en `/iniciar-sesion`.
- `scripts/deploy.sh` y `scripts/smoke-deployment.cjs` terminaron con código 0. Se verificaron páginas públicas, catálogos, sesión de administrador, renovación/cierre de sesión, registro y verificación por correo de prueba, subida y descarga firmada de imagen privada, y rechazo de descarga sin firma. Los datos temporales de prueba fueron eliminados.
- Los 10 contenedores anteriores conservan identificadores, fechas de arranque, reinicios, imágenes, puertos y redes. Los hashes de sus 9 archivos de configuración no cambiaron.
- Evidencias y respaldo previo (privados, fuera de este repo): `/var/lib/gmm-deploy-20260923/`, incluyendo `final-verification.json`, `deploy4.log`, `smoke.log` y `before-update-b6fb700.dump`.
- Builder propio (`gmm-build-20260923`) detenido al terminar para liberar recursos; queda disponible para el siguiente build.

## Pendientes para producción

- Configurar dominio y HTTPS público; evaluar otra IP pública con el proveedor si sigue siendo un requisito.
- Configurar SMTP real para la entrega de mensajes y los datos reales de Pago Móvil cuando corresponda.
- Configurar y validar la tasa de cambio: el valor inicial es `0` (sin tasa) hasta la primera sincronización exitosa con el BCV — no una referencia manual de prueba.
