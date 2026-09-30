# Registro completo de cambios — Guía Médica Monagas

Fecha de revisión: 29 de septiembre de 2026  
Rama integrada: `main`  
Commit funcional: `9c802c5`

Este documento reúne los cambios realizados para los controles administrativos y las validaciones ejecutadas antes de integrarlos al repositorio.

## Resumen técnico

Se añadió un módulo administrativo independiente para gestionar cuentas de médicos y pacientes, suspender o dar de baja cuentas de forma reversible, revocar accesos relacionados y registrar pagos externos para asignar planes pagados. La solución mantiene separados los datos clínicos, los permisos de pacientes y la facturación, y no elimina registros históricos.

## Reactivar y eliminar desde «Médicos» (30 de septiembre, ACT-0034)

Reportado por el titular: tras dar de baja a un médico, el botón «Reactivar» de la lista «Médicos» no hacía nada, y no había forma visible de eliminar la cuenta.

| Hallazgo | Cambio |
| --- | --- |
| «Reactivar» en «Médicos» llamaba al control del **perfil** (`PATCH /professionals/admin/:id/suspend`), que rechaza con 403 una cuenta suspendida o dada de baja; la página no mostraba el error. | La lista recibe el estado de la cuenta. Si la cuenta está suspendida o dada de baja, «Reactivar» reactiva la **cuenta** (`PATCH /admin/accounts/professionals/:id`, acción `RESTORE`, con motivo). Con la cuenta activa, el botón actúa sobre el perfil y se llama «Suspender perfil» / «Reactivar perfil». Los errores y el resultado se muestran. |
| La eliminación definitiva solo aparecía en «Cuentas y planes de médicos», con el filtro «Dadas de baja»; al dar de baja, la cuenta desaparecía de la vista por defecto. | «Eliminar definitivamente» aparece junto a «Reactivar» en «Médicos» y en la gestión de cuentas (médicos y pacientes). La vista sin filtro lista **todas** las cuentas; «Suspendidas» ya no incluye las bajas. |
| Solo se podía eliminar una cuenta dada de baja. | Se puede eliminar cualquier cuenta **desactivada**: suspendida o dada de baja. Una cuenta activa sigue respondiendo 409. El resto no cambia: solo SUPERADMIN, motivo y escribir `ELIMINAR`. |
| Un médico sin documentos cargados quedaba «En revisión» al reactivarlo, sin nada que revisar. | Vuelve a «Pendiente de documentos»; con documentos cargados sigue recalculándose como antes. |

El correo (y, en pacientes, la cédula) queda libre: la persona puede registrarse otra vez y entra como una cuenta nueva, sin documentos, verificación ni historial anteriores. El último correo al titular se lo dice.

## Revisión y mejoras (29 de septiembre, ACT-0031)

La revisión del commit `9c802c5` encontró huecos de uso y de alcance. Cambios aplicados sobre `main`:

| Hallazgo | Cambio |
| --- | --- |
| Nadie se enteraba de una suspensión, baja, reactivación o plan asignado; al iniciar sesión, la cuenta suspendida solo veía «Credenciales inválidas». | El titular recibe aviso en su panel y por correo, con el motivo. Con la contraseña **correcta**, el inicio de sesión responde `ACCOUNT_SUSPENDED` o `ACCOUNT_DELETED` con una explicación; con una incorrecta sigue diciendo «Credenciales inválidas» (no revela el estado). |
| Reactivar a un médico lo dejaba «en revisión» y oculto sin nada pendiente de revisar: salía de ese limbo solo si el médico editaba su perfil. | Al reactivar se recalculan verificación y publicación con sus documentos, igual que al reactivar desde «Médicos». Sin requisitos completos sigue fuera del directorio. |
| La suspensión o baja del paciente vaciaba `shareScopes`: al reactivarse, su próximo código no compartiría nada. | Se invalida el código, pero se conserva la preferencia de qué compartir. Los consentimientos revocados siguen sin restaurarse. |
| Renovar antes de tiempo el mismo plan cortaba los días ya pagados; no se podían registrar varios meses de una vez. | Renovar el mismo plan suma el tiempo al final del período vigente (misma suscripción, una cuota pagada más). Nuevo campo `periods` (1 a 12 ciclos). El formulario muestra la vigencia resultante antes de guardar. Cambiar de plan sigue reemplazando sin prorrateo. |
| «Eliminar» nunca eliminaba: la baja reversible no cumplía una solicitud de supresión. | **Eliminación definitiva** (`POST …/:id/purge`), solo SUPERADMIN (permiso `PURGE_ACCOUNTS`), solo sobre cuentas ya dadas de baja, escribiendo `ELIMINAR`. Ver abajo. |
| Los pacientes no se podían buscar por cédula ni teléfono. | Búsqueda por cédula o teléfono **exactos**, por su hash (la tabla nunca se descifra para buscar). |
| Producción usaba Next 16.3.5, afectado por GHSA-vcvr-r3jv-pc5j (RCE crítica en `next/og`). | Next 16.3.7, framer-motion 13.4.6 y AWS SDK 3.1142 (reemplazan los PR #8 y #9 de Dependabot). |

### Eliminación definitiva

Cumple la sección 8 de la Política de privacidad: se borran los datos personales y los archivos, y solo se conserva lo que la ley obliga a guardar.

- **Médico:** se borran perfil, documentos (y sus archivos), foto, sedes, horario, especialidades, publicaciones, mensajes, agenda, notas clínicas, finanzas y las fichas sin cuenta que cargó y que ningún otro médico usa. Sus citas futuras se cancelan y se avisa a los pacientes. Sus pagos y suscripciones se conservan por normativa tributaria; como dependen de su perfil, la cuenta queda como registro anónimo («Cuenta eliminada», correo `eliminado-<id>@cuentas.invalid`, `purgedAt`). Las autorizaciones que recibió se revocan y se conservan como evidencia.
- **Paciente:** se borra la cuenta. Si ningún médico lo atendió ni recibió su autorización, también se borra su ficha. Si no, la ficha queda solo con el código `GMM-XXXX`, para que la agenda del médico y la evidencia sigan en pie; se borran identidad, contacto, salud, fotos y código para compartir. Sus citas futuras se cancelan y se avisa al médico.
- No procede si hay un pago reportado pendiente de revisión o si la cuenta es dueña de una organización.
- El titular recibe un último correo. Después se anonimiza su registro de envíos (`MessageLog`), y su correo queda libre para registrarse de nuevo.
- Queda auditada como `ACCOUNT_PURGE`, con el motivo. Migración `20260929190000_account_purge`: columna `purgedAt` y una restricción que exige `deletedAt` e `isActive = false` (al eliminar una cuenta que solo estaba suspendida, `deletedAt` se fija en ese momento).

## Cambios realizados

### Base de datos

- Se añadieron `deletedAt` y `moderationReason` al modelo `User`.
- Se añadió la migración `20260929160000_account_moderation`.
- La migración impone que una cuenta con `deletedAt` no pueda permanecer activa.
- La migración no borra usuarios, perfiles, citas, pagos, suscripciones ni datos clínicos.

### Permisos y seguridad

- Se añadieron los permisos `MANAGE_ACCOUNTS` y `ASSIGN_PAID_PLANS`.
- Las rutas administrativas exigen autenticación, permisos del rol y validación de UUID.
- Las operaciones administrativas registran auditoría con actor, recurso, motivo y dirección IP.
- Cada suspensión o baja incrementa `tokenVersion`, revoca refresh tokens, elimina tokens de verificación y cierra sesiones de bóveda.
- Se conserva la protección adicional de la bóveda para consultar o modificar cuentas de pacientes.

### Gestión de médicos

- Listado paginado por nombre, correo, estado y datos básicos del perfil.
- Suspensión de cuenta con retiro inmediato del directorio público.
- Baja reversible con conservación de pagos, citas e historial.
- Restauración de la cuenta sin reactivar consentimientos; verificación y publicación se recalculan con sus documentos (ACT-0031).
- Revocación de permisos de pacientes cuando se suspende o da de baja al médico.
- Protección contra cambios simultáneos mediante actualización condicional.

### Gestión de pacientes

- Listado administrativo de pacientes que tienen una cuenta de usuario.
- Búsqueda por nombre, correo y código de paciente, sin exponer datos de salud cifrados.
- Suspensión y baja reversible con cierre de sesiones.
- Revocación de consentimientos, relaciones profesionales y código compartido.
- Restauración sin reactivar consentimientos anteriores.
- Las fichas walk-in sin cuenta conservan su funcionamiento y no se mezclan con esta gestión de cuentas.

### Asignación de planes pagados

- Nueva ruta `POST /subscriptions/admin/professionals/:id/assign-paid-plan`.
- Registro del plan, banco, método, referencia, importe recibido, fecha y motivo.
- Creación de pago completado y suscripción activa en una transacción serializable.
- Cancelación de la suscripción activa anterior sin prorrateo.
- Rechazo de cuentas inactivas, planes gratuitos u organizacionales, pagos futuros, periodos vencidos, importes inválidos y referencias duplicadas.
- Los planes Plus y Premium mantienen el requisito de documentos completos.
- No se inventa una tasa BCV histórica y la operación no publica ni verifica automáticamente al médico.

### Interfaz web

- Nueva sección de administración para cuentas de médicos y pacientes.
- Modales con motivo obligatorio, confirmación explícita y mensajes de error.
- Filtros de estado, búsqueda, paginación y actualización de resultados.
- Formulario de registro de pago con validación de banco, referencia, importe y fecha.
- Enlace desde la gestión existente de médicos hacia las nuevas funciones.

### CI y documentación

- Se incorporó la suite administrativa al flujo de integración continua.
- Se documentaron los límites de la baja reversible y los pasos necesarios para desplegar la migración.

## Rutas administrativas nuevas

- `GET/PATCH /admin/accounts/professionals`
- `GET/PATCH /patients/admin/accounts`
- `POST /admin/accounts/professionals/:id/purge` y `POST /patients/admin/accounts/:id/purge` (solo SUPERADMIN)
- `POST /subscriptions/admin/professionals/:id/assign-paid-plan`

Las rutas de pacientes requieren además abrir la bóveda administrativa.

## Funciones implementadas

- Administración → Cuentas y planes de médicos: buscar, filtrar, suspender, dar de baja y restaurar cuentas.
- Administración → Cuentas de pacientes: las mismas acciones, con apertura obligatoria de la bóveda de pacientes.
- Cada cambio exige un motivo, queda auditado y revoca las sesiones anteriores.
- La baja es reversible: conserva historias clínicas, pagos y relaciones. Para una solicitud de supresión, el SUPERADMIN elimina definitivamente la cuenta dada de baja (ver «Eliminación definitiva»).
- Suspender un médico lo retira del directorio y revoca sus permisos sobre pacientes. Al restaurarlo vuelve al directorio solo si sus documentos, foto y biografía cumplen los requisitos.
- Suspender o dar de baja un paciente revoca permisos y código compartido. Restaurarlo no reactiva consentimientos antiguos.
- Esta gestión cubre cuentas de pacientes registradas. Las fichas de pacientes sin cuenta no se incluyen.

## Asignar un plan pagado

1. Abrir Cuentas y planes de médicos y localizar al profesional.
2. Elegir la acción de asignar plan.
3. Seleccionar un plan activo y registrar banco, método, referencia, importe realmente recibido, fecha y motivo.
4. Indicar cuántos períodos cubre el pago y revisar la vigencia que muestra el formulario. Renovar el mismo plan suma el tiempo al final del período vigente; otro plan reemplaza al anterior sin prorrateo.
5. Guardar. El sistema crea el pago completado y la suscripción, y registra al administrador responsable.

La vigencia se calcula desde la fecha del pago (o desde el fin del período vigente, si se renueva el mismo plan). El médico recibe el aviso en su panel y por correo. Se rechazan pagos futuros, periodos ya vencidos, referencias duplicadas y cuentas inactivas. Si hay un pago pendiente, debe revisarse desde el flujo existente. Los planes Plus y Premium conservan sus requisitos documentales. Esta operación no publica ni verifica al médico y no inventa una tasa de cambio histórica.

## Validación local

- Compilación del frontend y backend completada.
- 78 pruebas unitarias aprobadas; cuatro pruebas que requieren ClamAV real omitidas en el entorno local.
- 29 comprobaciones contra API y PostgreSQL reales: autorización, bóveda para lectura y escritura, revocación, conservación de registros, restauración, rechazo de importes cero y fechas futuras, y pagos concurrentes.
- Migración aplicada en PostgreSQL desechable, sin diferencia entre esquema y migraciones.
- Suite administrativa incorporada al CI. Su ejecución remota queda pendiente del envío de los cambios.
- Segunda revisión: la suite general `test/e2e/api.e2e.mjs` terminó con `TODO OK` y código de salida 0, incluyendo consentimiento, bóveda, organizaciones, pagos y reservas concurrentes, publicación y privacidad del directorio.

## Despliegue

**Hecho el 29 de septiembre (ACT-0031, ver [`Actualizaciones.md`](Actualizaciones.md#act-0031)).**
- Producción pasó de `90fbe1c` a `05294c8`.
- Respaldo cifrado previo y migraciones `20260929160000_account_moderation` y `20260929190000_account_purge` aplicadas.
- Solo se recrearon `api`, `web` y `clamav` de `gmm-independent`.
- Prueba de humo 25/25, con Next 16.3.7 y React 19.3.0.
- Las rutas nuevas responden 401 sin sesión.
- No se hicieron pruebas destructivas en producción.

El plan original de despliegue se conserva abajo como referencia.

### Segunda revisión

Se reforzaron tres casos: revalidación del código y alcance compartido después de bloquear las cuentas en la transacción; rechazo de cambios antiguos desde el control previo de suspensión si cambió la cuenta; limpieza de resultados anteriores cuando falla una búsqueda administrativa. Frontend y backend volvieron a compilar y las 78 pruebas unitarias y 29 comprobaciones administrativas pasaron de nuevo sobre una base limpia. La revisión visual interactiva y la verificación en producción siguen pendientes.

Estos cambios están en el worktree local `gmm-admin-controls`; este informe no certifica su despliegue en el VPS.

1. Comparar la versión actual de `/opt/guiamedicamonagas` con la base de estos cambios (`13a3905`) y preservar cambios posteriores.
2. Respaldar la base de datos y configuración exclusiva de `gmm-independent`.
3. Construir las imágenes de API y web con la configuración productiva del proyecto.
4. Aplicar `prisma migrate deploy` con la conexión exclusiva de este proyecto. La migración `20260929160000_account_moderation` agrega columnas opcionales y una restricción de coherencia; no borra filas.
5. Recrear únicamente API y web de `gmm-independent`, sin dependencias ni reinicios de otros proyectos.
6. Verificar salud, acceso administrativo, bóveda y las rutas nuevas. No usar pacientes reales para pruebas destructivas.

Los demás puntos de la auditoría —publicación al 60 %, alcance del consentimiento QR, backup externo y datos del responsable legal— no quedan resueltos por esta entrega.
