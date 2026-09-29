# Contexto completo del proyecto y solicitudes

Fecha de actualización: 29 de septiembre de 2026  
Repositorio: `https://github.com/merchandev/guiamedicamonagas`  
Rama integrada: `main`  
Proyecto VPS: `gmm-independent`  
Servidor: `72.61.77.167`  
Dominio: `guiamedicamonagas.com`

## 1. Peticiones realizadas

### Levantar un proyecto independiente

Se solicitó subir el repositorio al VPS como un proyecto nuevo, completamente separado de las aplicaciones existentes, sin reutilizar sus configuraciones ni puertos y sin tocar sus contenedores.

La condición principal fue mantener aislado `gmm-independent`, usando sus propios servicios, red, volúmenes, configuración y puertos.

### Diagnóstico de despliegue y dominio

Se pidió revisar por qué el proyecto no aparecía correctamente en el dominio. Se identificó el problema de configuración CORS: el backend permitía la IP y puerto HTTP en lugar del dominio HTTPS.

La corrección prevista fue:

```env
FRONTEND_URL=https://guiamedicamonagas.com
COOKIE_SECURE=true
```

También se revisó que el dominio apuntara a `72.61.77.167` y que HTTPS llegara al servidor mediante el proxy existente.

### Retirar contenido no solicitado

Se pidió retirar la mención de “INPREMEDICO” del contenido público de la web.

### Revisar el precio BCV

Se reportó que el precio del BCV no funcionaba correctamente. Se revisaron las advertencias del arranque y el flujo de sincronización de tasa, distinguiendo los avisos de configuración de los errores fatales.

### Auditoría técnica

Se recibió una auditoría que concluyó que la plataforma tenía una base sólida, pero señaló pendientes de seguridad y producto:

- publicación de médicos con el umbral del 60 %;
- consentimiento QR con alcance prolongado;
- falta de respaldo externo y gestión externa de llaves;
- responsable legal sin completar;
- CSP estricta;
- consentimiento antes de cargar Google Maps;
- lint de Next integrado al CI;
- pruebas Playwright y accesibilidad;
- restricciones para cuentas sin correo verificado;
- canal real de alertas del servidor;
- actualización de README, roadmap y documentación;
- revisión de Search Console y sitemap productivo.

La parte accionable solicitada después de la auditoría fue crear controles para que un administrador pudiera eliminar o suspender médicos y pacientes, y asignar a un médico el plan que hubiera pagado.

## 2. Lo que quedó implementado

### Administración de cuentas

- Listado paginado de cuentas de médicos.
- Listado paginado de pacientes con cuenta.
- Búsqueda por nombre, correo y código de paciente.
- Filtros por activa, suspendida y dada de baja.
- Suspensión, baja reversible y restauración.
- Motivo obligatorio y auditoría de cada operación.
- Revocación de sesiones y tokens al cambiar el estado.
- Protección para impedir que un administrador modifique su propia cuenta o cuentas administrativas.

La baja no elimina físicamente usuarios, pagos, citas, suscripciones, perfiles ni datos clínicos. Las fichas walk-in sin cuenta no entran en el listado de cuentas de pacientes.

### Protección de pacientes

- La gestión de pacientes exige abrir la bóveda administrativa.
- Se evita exponer datos de salud cifrados en el listado.
- La suspensión o baja revoca permisos profesionales y códigos compartidos.
- Restaurar una cuenta no restaura consentimientos ni sesiones anteriores.
- Se revalida el código QR dentro de la transacción para evitar que una solicitud antigua recree permisos después de una baja.

### Gestión de médicos

- Suspender una cuenta la retira del directorio público.
- Se revocan sus permisos sobre pacientes.
- Restaurar la cuenta la deja en revisión y no la publica automáticamente.
- Se protegió el control anterior de suspensión contra cambios simultáneos.
- La publicación nunca se reactiva para una cuenta inactiva.

### Asignación de planes pagados

Se añadió el endpoint:

```text
POST /subscriptions/admin/professionals/:id/assign-paid-plan
```

Permite registrar:

- plan;
- banco emisor;
- método de pago;
- referencia bancaria;
- importe recibido;
- fecha del pago;
- motivo y evidencia de revisión.

La operación es transaccional y serializable. Rechaza referencias duplicadas, pagos futuros, importes inválidos, periodos vencidos, planes gratuitos u organizacionales, cuentas inactivas y planes Plus/Premium sin documentación completa.

El pago queda completado, se crea la suscripción activa y se cancela la suscripción anterior sin prorrateo. No se inventa una tasa BCV histórica y la asignación no publica ni verifica automáticamente al médico.

### Interfaz de administración

Se añadieron las páginas:

- `/admin/cuentas-medicos`
- `/admin/pacientes`

Incluyen búsqueda, filtros, paginación, confirmación de acciones, motivos obligatorios y formulario de registro de pago.

### Base de datos y permisos

- Campos `deletedAt` y `moderationReason` en `User`.
- Migración `20260929160000_account_moderation`.
- Permisos `MANAGE_ACCOUNTS` y `ASSIGN_PAID_PLANS`.
- Auditoría para listados, suspensiones, bajas, restauraciones y asignaciones de planes.

### Pruebas realizadas

- Frontend compilado correctamente.
- Backend compilado correctamente.
- 78 pruebas unitarias aprobadas.
- 29 comprobaciones administrativas contra API y PostgreSQL limpio.
- Suite general de API terminada con `TODO OK`.
- Migraciones aplicadas sin diferencias frente al esquema.
- Protección contra pagos duplicados concurrentes comprobada.
- CodeQL, Trivy, gitleaks, auditorías de dependencias y checks de CI aprobados para la integración documentada.

## 3. Estado del repositorio

Los cambios están integrados en `main` mediante:

- PR #10: funcionalidades administrativas.
- PR #11: documentación completa.
- Último commit de documentación: `f969f6b`.
- Última integración visible en `main`: `0177fff`.

El documento técnico complementario es `CONTROLES-ADMINISTRATIVOS.md`.

## 4. Lo que falta por implementar o confirmar

### Despliegue en producción

Todavía debe ejecutarse y verificarse el despliegue de estos cambios en el VPS:

1. Comparar la versión actual de `/opt/guiamedicamonagas` con `main`.
2. Confirmar que no haya cambios locales o despliegues posteriores que deban conservarse.
3. Respaldar la base y el `.env` exclusivo de `gmm-independent`.
4. Ejecutar `prisma migrate deploy` usando solamente la base de este proyecto.
5. Reconstruir y reiniciar únicamente los servicios propios de `gmm-independent`.
6. Verificar dominio, HTTPS, CORS, login, bóveda y las rutas administrativas.
7. Confirmar que ningún contenedor, red, volumen o puerto de los demás proyectos haya sido modificado.

No se debe usar una configuración histórica ni reiniciar Traefik u otros proyectos para este despliegue.

### Pendientes de la auditoría original

Estos puntos no forman parte del commit administrativo y aún requieren una decisión o implementación independiente:

- decidir si el 60 % de documentos sigue siendo suficiente para publicar médicos;
- reducir o rediseñar la duración y el alcance del consentimiento QR;
- configurar backups externos probados;
- separar y rotar llaves fuera del VPS;
- completar la identidad y responsabilidad legal;
- aplicar una CSP estricta compatible con la aplicación;
- bloquear Google Maps hasta obtener consentimiento o interacción;
- reparar y añadir `npm run lint` al CI;
- incorporar Playwright y pruebas de accesibilidad;
- decidir cómo tratar cuentas sin correo verificado;
- configurar alertas reales del servidor;
- completar README, roadmap y documentación técnica;
- auditar Search Console y enviar el sitemap productivo.

### Confirmaciones de producto pendientes

- Definir si “eliminar” debe seguir siendo baja reversible o si habrá un flujo legal separado para supresión definitiva.
- Definir si la administración debe incluir fichas walk-in sin cuenta.
- Confirmar el canal de notificación al médico cuando un administrador asigna manualmente un plan.
- Confirmar la política de restauración de permisos y consentimientos, que actualmente exige generarlos de nuevo.

## 5. Resumen final

La funcionalidad administrativa solicitada está implementada, probada e integrada en `main`. El repositorio está listo para una ventana controlada de despliegue. Lo que falta para cerrar el trabajo operativo es aplicar la migración y publicar los servicios de `gmm-independent` en el VPS, verificando el dominio sin afectar a las aplicaciones existentes. Los pendientes de auditoría listados arriba siguen fuera de este alcance.
