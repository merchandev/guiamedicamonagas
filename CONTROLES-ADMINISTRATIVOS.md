# Controles administrativos — 29 de septiembre de 2026

## Funciones implementadas

- Administración → Cuentas y planes de médicos: buscar, filtrar, suspender, dar de baja y restaurar cuentas.
- Administración → Cuentas de pacientes: las mismas acciones, con apertura obligatoria de la bóveda de pacientes.
- Cada cambio exige un motivo, queda auditado y revoca las sesiones anteriores.
- La baja es reversible: conserva historias clínicas, pagos y relaciones. No constituye un borrado definitivo ni una respuesta automática a solicitudes de supresión de datos.
- Suspender un médico lo retira del directorio y revoca sus permisos sobre pacientes. Restaurarlo no lo publica automáticamente.
- Suspender o dar de baja un paciente revoca permisos y código compartido. Restaurarlo no reactiva consentimientos antiguos.
- Esta gestión cubre cuentas de pacientes registradas. Las fichas de pacientes sin cuenta no se incluyen.

## Asignar un plan pagado

1. Abrir Cuentas y planes de médicos y localizar al profesional.
2. Elegir la acción de asignar plan.
3. Seleccionar un plan activo y registrar banco, método, referencia, importe realmente recibido, fecha y motivo.
4. Confirmar que el pago fue verificado y que la asignación sustituye la suscripción anterior, sin prorrateo.
5. Guardar. El sistema crea el pago completado y la suscripción, y registra al administrador responsable.

La vigencia se calcula desde la fecha del pago. Se rechazan pagos futuros, periodos ya vencidos, referencias duplicadas y cuentas inactivas. Si hay un pago pendiente, debe revisarse desde el flujo existente. Los planes Plus y Premium conservan sus requisitos documentales. Esta operación no publica ni verifica al médico y no inventa una tasa de cambio histórica.

## Validación local

- Compilación del frontend y backend completada.
- 78 pruebas unitarias aprobadas; cuatro pruebas que requieren ClamAV real omitidas en el entorno local.
- 29 comprobaciones contra API y PostgreSQL reales: autorización, bóveda para lectura y escritura, revocación, conservación de registros, restauración, rechazo de importes cero y fechas futuras, y pagos concurrentes.
- Migración aplicada en PostgreSQL desechable, sin diferencia entre esquema y migraciones.
- Suite administrativa incorporada al CI. Su ejecución remota queda pendiente del envío de los cambios.
- Segunda revisión: la suite general `test/e2e/api.e2e.mjs` terminó con `TODO OK` y código de salida 0, incluyendo consentimiento, bóveda, organizaciones, pagos y reservas concurrentes, publicación y privacidad del directorio.

## Despliegue pendiente

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
