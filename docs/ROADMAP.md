# Hoja de ruta

Estado al 2026-10-01. Qué se hizo y cuándo: [`Actualizaciones.md`](../Actualizaciones.md). Qué falta para operar con
pacientes reales, con su control automático: [`docs/operations/go-no-go.md`](operations/go-no-go.md).

## V1 — construida y en producción

| Área | Qué hay |
|---|---|
| Directorio | Médicos publicados con verificación documental, búsqueda por nombre, especialidad, municipio o código `GM-…`, páginas por especialidad y por especialidad + municipio, SEO automático (título, descripción, JSON-LD, mapa del sitio) y tarjeta para compartir |
| Cuentas | Registro de médico y de paciente, JWT con *refresh* rotado, Argon2id, verificación de correo, recuperación de contraseña, MFA por correo para administradores, permisos granulares, cierre de todas las sesiones, suspensión, baja y eliminación definitiva |
| Verificación del médico | Documentos en orden de obtención, revisión humana, publicación con el 60 % aprobado más biografía y foto, sello con el 100 % |
| Pacientes | Ficha con datos de salud cifrados, consentimiento por alcance y tiempo, código y QR para autorizar, revocación, historial de accesos, descarga de sus datos y solicitudes; los registros cerrados incluso para la administración (bóveda con código) |
| Agenda | Horarios, disponibilidad, reservas sin doble asignación, estados de la cita, recordatorios |
| Planes y pagos | Perfil Básico, Profesional, Plus, Premium y Marca Médica (servicio de contenido); Pago Móvil reportado desde el panel y aprobado por la administración; tasa BCV automática; estadísticas del médico según su plan |
| Administración | Verificaciones, identidad de pacientes, cuentas y planes, pagos, solicitudes legales, SEO, cookies, catálogos, Pago Móvil propio y video de muestra |
| Legal | 21 documentos versionados, aceptaciones con evidencia, canal de reclamos con número de seguimiento, avisos breves |
| Seguridad | Cifrado de campos con rotación de claves, antivirus obligatorio, subidas re-codificadas, *rate limit*, auditoría, cookies seguras, HSTS, pacientes fuera de buscadores |
| Calidad | CI con tipos, unitarias, e2e de la API (cifrado, consentimiento, permisos, concurrencia de pagos), migraciones contra base limpia, ESLint del frontend; Seguridad con CodeQL, gitleaks, Trivy y `npm audit` con política de HIGH |
| Operación | Despliegue reproducible con respaldo previo, *rollback* y versión verificable; respaldos cifrados con prueba de restauración semanal; monitoreo con alertas y monitor externo |

## Antes del lanzamiento, en este orden

| # | Tarea | Quién | Estado |
|---|---|---|---|
| 1 | Producción corre el último `main`, verificable desde afuera | Código | 🟢 Hecho ([ACT-0037](../Actualizaciones.md#act-0037)) |
| 2 | Datos del titular: razón social, RIF, domicilio, responsable del tratamiento y correos (legal, privacidad, soporte, seguridad); nueva versión del Aviso legal y la Política de privacidad | Titular → código | 🔴 Pendiente |
| 3 | SMTP real con dominio propio (SPF, DKIM, DMARC) | Titular → configuración | 🔴 Pendiente |
| 4 | MFA obligatorio para administradores (código por correo) | Configuración tras el 3 | 🟡 Excepción hasta el 2026-10-24 |
| 5 | Custodia de las claves de datos y de la frase de respaldos fuera del VPS | Titular (`scripts/key-escrow.sh`) | 🔴 Pendiente |
| 6 | Copia de respaldos fuera del servidor con credencial de solo escritura | Titular elige el destino → configuración | 🔴 Pendiente (código listo) |
| 7 | Restauración desde la copia externa y simulacro de desastre con la custodia | Configuración | 🔴 Pendiente (código listo) |
| 8 | Canal de alertas en el teléfono (Telegram recomendado) e interruptor de hombre muerto | Titular → configuración | 🔴 Pendiente (código listo; el monitor de GitHub ya corre) |
| 9 | ESLint del frontend en CI | Código | 🟢 Hecho ([ACT-0037](../Actualizaciones.md#act-0037)) |
| 10 | Pruebas de extremo a extremo del frontend (Playwright): registro, verificación, búsqueda, reserva, QR, planes, Pago Móvil, reclamos, móvil | Código | 🔵 Siguiente |
| 11 | Seguridad dinámica: matriz de autorización automatizada (IDOR/BOLA, escalada de rol), escaneo pasivo en CI y CSP; **pentest humano** antes de cargar datos reales | Código + tercero | 🔵 Siguiente |
| 12 | QA completo en escritorio y móvil (360–430 px), Chrome, Firefox y Safari | Código + titular | 🔵 Planificado |
| 13 | Médicos reales publicados y búsqueda verificada. Referencia: 20–30 antes de hacer publicidad, 50+ para que el directorio sea útil, 100+ para trabajar SEO local | Titular | 🔴 Pendiente (hoy 0) |
| 14 | Revisión legal por un abogado venezolano y plazos «en definición» (retención, reembolsos, jurisdicción) | Titular | 🔴 Pendiente |
| 15 | Search Console (verificación por DNS) y envío del mapa del sitio | Titular | 🔴 Pendiente |
| 16 | Pago Móvil de la plataforma y video de muestra de Marca Médica | Titular (panel) | 🔴 Pendiente |
| 17 | Cambiar el código de la bóveda de pacientes (se compartió por chat) | Titular (`scripts/set-patient-vault-code.sh`) | 🔴 Pendiente |
| 18 | Congelar la V1: desplegar con `GMM_REQUIRE_GO=true` y lanzar | Todos | — |

**V1 lista** = todo lo anterior en verde a la vez: último código desplegado, médicos reales publicados, identidad legal
completa, SMTP y MFA, claves custodiadas, copia externa probada, alertas, E2E del frontend, pentest sin hallazgos altos
explotables y Search Console verificado.

## V1.1 — después del lanzamiento

- Pagos C2P/P2C o API bancaria autorizada (conciliación automática en lugar del reporte manual).
- Eliminación de cuenta por autoservicio y registro de la aceptación al contratar un plan.
- Agenda: duración por servicio, consulta en línea, precio, política de cancelación, feriados, varias agendas y lista de espera.
- Historia clínica (`ClinicalNote`, ya cifrada en el modelo) y finanzas del médico.
- Rastreador de errores de la aplicación (decisión de proveedor; ver [monitoreo-y-alertas.md](operations/monitoreo-y-alertas.md)).
- Tipografías dentro del repositorio (sin descargar de Google durante el build) e imagen propia de MinIO.

## V2 — Farmacias, laboratorios y clínicas

El backend está listo (organizaciones, equipos con roles, invitaciones, plan propio). Con `ORGANIZATIONS_LAUNCHED =
false` el sitio muestra «Próximamente», no permite el registro público ni la contratación y `/farmacias` no figura en
el mapa del sitio. Se activa sin migraciones cuando haya alianzas firmadas.

## V3 — App móvil y notificaciones push

Requisitos ya cumplidos: dominio con HTTPS y páginas legales. Faltan el SMTP real y los datos del titular. Incluye
autenticación por token para clientes que no son navegador y notificaciones push (VAPID, modelo `PushSubscription` ya
migrado).

## Deuda técnica conocida

| Tema | Estado | Cuándo se resuelve |
|---|---|---|
| Dos HIGH exceptuadas en la CLI de Prisma (`deepmerge-ts`, `mysql2`), no alcanzables desde usuarios | Vence el 2026-12-31 | Prisma 7.10.0 es la última 7.x; la 8 está en *release candidate*. Revisar con cada versión estable ([vulnerabilidades.md](security/vulnerabilidades.md)) |
| ESLint 9 marcada como sin soporte por sus autores | Sin riesgo en producción (solo desarrollo) | Pasar a ESLint 10 cuando `eslint-plugin-react` y `eslint-config-next` la admitan |
| PR #13 y #14 de Dependabot | Fallan en gitleaks por un hallazgo ya ignorado en `main` | Rebasarlos y fusionarlos con aprobación del titular |
| Borradores sin revisar en la rama local `wip/borradores-locales-2026-09-29` | El lint del frontend y el estado de dependencias ya se hicieron aparte; quedan reglas de producto (documentos esenciales para publicar, consentimiento del QR de 30 a 7 días, bloqueo por correo sin verificar) | Decisión del titular |
