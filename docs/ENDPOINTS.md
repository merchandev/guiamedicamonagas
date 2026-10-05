# Endpoints de la API - v1

Todos los endpoints tienen como prefijo base `/api/v1`. Salvo los marcados como
públicos, requieren `Authorization: Bearer <access token>`. Los endpoints
administrativos exigen un **permiso** concreto (ver `backend/src/common/permissions.ts`),
no solo el rol.

## Core
* `GET /health` — estado de la API (público).

## Autenticación
* `POST /auth/register` — registro de paciente, médico u organización; exige `acceptLegal: true` (público). Con `invitationToken` (y `role: ORGANIZATION`) la cuenta se une al equipo que la invitó en vez de crear otra organización; el correo debe ser el invitado.
* `POST /auth/login` — inicio de sesión; con `ADMIN_MFA_ENABLED` un administrador recibe `{ mfaRequired, challengeToken }` (público).
* `POST /auth/mfa/verify` — código de 6 dígitos del segundo factor (público).
* `POST /auth/refresh` · `POST /auth/logout` — sesión por cookie httpOnly; un refresh token reutilizado revoca todas las sesiones.
* `GET /auth/me` — usuario, permisos, organizaciones y si debe re-aceptar los textos legales.
* `POST /auth/accept-legal` — acepta las versiones vigentes de Términos y Privacidad.
* `POST /auth/change-password` — cambia la contraseña, cierra las demás sesiones y devuelve un access token nuevo para este dispositivo.
* `POST /auth/logout-all` — cierra todas las sesiones (refresh y access tokens) al instante.

Cada access token lleva la versión de sesión del usuario (`tv`); si no coincide con la de la base de datos, o la cuenta está inactiva, la API responde 401.

## Pacientes (ficha propia, cifrada)
* `GET /patients/me` · `PATCH /patients/me` — ficha y datos de salud.
* `POST /patients/me/photo` · `POST /patients/me/id-photo` — fotos (verificadas y re-codificadas).
* `GET /patients/me/grants` · `POST /patients/me/grants` · `DELETE /patients/me/grants/:id` — autorizaciones a médicos.
* `GET /patients/me/professionals` — médicos con los que tuvo citas.
* Admin (`VERIFY_PATIENT_IDENTITY`): `GET /patients/admin/identity?status=PENDING|VERIFIED|REJECTED` (sin cédulas), `GET /patients/admin/identity/:id` (cédula + foto firmada 5 min, auditado), `PATCH /patients/admin/identity/:id/review` (`{ approved, note }`; rechazar exige nota y borra la foto).

## Citas
* `GET /appointments/availability` (público) · `POST /appointments` (acepta `shareScopes`/`shareDays`) · `GET /appointments/me`.
* Paciente: `PATCH /appointments/:id/reschedule` y `PATCH /appointments/:id/cancel` (también el médico; solo se avisa a la otra parte).
* Médico: `GET /appointments/me/calendar?from=&to=` (hasta 62 días: citas, horas de atención y bloqueos), `GET /appointments/me/history` (filtros y paginado; nombre y teléfono solo con autorización, auditado), `GET /appointments/me/:id` (detalle con su línea de tiempo), `GET /appointments/me/slots` (horarios libres para «Mover»), `POST /appointments/me/manual` (`outsideSchedule` para atender fuera de horario).
* Médico: `GET /appointments/me/agenda`, `GET /appointments/me/patients`, `POST /appointments/me/patients/:id/data` (solo con autorización vigente, auditado), `POST /appointments/me/patients/:id/access-request`.

## Profesionales
* `GET /professionals` (público; incluye `featured`) · `GET /professionals/:slug` (público).
* `GET /professionals/sitemap?page=` · `GET /professionals/landing-pages` (públicos, SEO).
* `GET|PATCH /professionals/me`, `POST /professionals/me/photo`, sedes y redes.

## Documentos de verificación
* Médico: `GET /documents/requirements`, `GET /documents/me`, `POST /documents` (subida verificada y analizada por ClamAV), `GET /documents/me/:id/download`.
* Admin (`VERIFY_PROFESSIONALS`): `GET /documents/admin/queue`, `GET /documents/admin/:id/download` (descarga auditada: `PROFESSIONAL_DOCUMENT_DOWNLOADED`), `PATCH /documents/admin/:id/review`.

## Organizaciones
* `GET /organizations` · `GET /organizations/:slug` (públicos; solo verificadas).
* Autogestión (cualquier cuenta que sea **miembro**; el rol dentro de la organización decide — OWNER/ADMIN/EDITOR, ver `organization-roles.ts`): `GET /organizations/me/list`, `GET|PUT /organizations/me/:id` (nombre/tipo/RIF solo OWNER), logo, médicos asociados, estadísticas.
* Equipo: `GET /organizations/me/:id/members`, `PATCH /organizations/me/:id/members/:memberId` (`{ role }`, solo OWNER; transferir propiedad = ascender a otro a OWNER), `DELETE /organizations/me/:id/members/:memberId`.
* Invitaciones: `GET|POST /organizations/me/:id/invitations` (`{ email, role }`; OWNER invita ADMIN/EDITOR, ADMIN solo EDITOR), `DELETE /organizations/me/:id/invitations/:invitationId`; `GET /organizations/invitations/preview?token=` (público: organización, rol y correo enmascarado); `POST /organizations/invitations/accept` (`{ token }`, con sesión de la cuenta invitada).
* Médico: `GET /organizations/affiliations/me`, `PATCH /organizations/affiliations/me/:organizationId`.
* Admin (`MANAGE_ORGANIZATIONS`): `GET /organizations/admin/list`, `PATCH /organizations/admin/:id/review`, CRUD.

## Geografía y catálogos
* `GET /geo/states` · `GET /geo/municipalities?state=` · `GET /geo/municipalities/:id/parishes` (públicos).
* `GET /payments/banks` (público); admin (`MANAGE_CATALOG`): `/geo/admin/*`, `/payments/admin/banks`.

## Suscripciones y pagos
* `GET /subscriptions/plans` · `GET /subscriptions/exchange-rate` (públicos).
* `GET /subscriptions/showcase` (público): `{ sampleVideoId }`, el video de muestra del plan Marca Médica en `/planes` (o null). `PUT /subscriptions/admin/showcase` (`MANAGE_PLANS`, `{ url }` de YouTube o null; auditado como `PLAN_SAMPLE_VIDEO_SET`/`PLAN_SAMPLE_VIDEO_CLEARED`).
* `GET|POST /subscriptions/me` (médico) · `GET|POST /subscriptions/organizations/:id` (organización).
* `POST /payments` — reporte de Pago Móvil con comprobante (el médico, o dueño/admin de la organización). Una referencia del mismo banco no puede repetirse en pagos vigentes (409, garantizado por índice único).
* `GET /payments/pago-movil-account` — cuenta a la que se paga (titular, cédula o RIF, banco, teléfono y número de cuenta). Solo con sesión de médico o de miembro de una organización: se muestra dentro del panel, junto al formulario de reporte. Devuelve `configured: false` mientras la administración no la registre.
* Admin: cola, comprobante (apertura auditada: `PAYMENT_RECEIPT_VIEWED`) y revisión (`REVIEW_PAYMENTS`); planes y tasa manual (`MANAGE_PLANS`).
* Admin: `GET /payments/admin/pago-movil-account` (`REVIEW_PAYMENTS`) y `PUT /payments/admin/pago-movil-account` (además `MANAGE_PLANS`, es decir SUPERADMIN; auditado como `PAGO_MOVIL_ACCOUNT_UPDATED`). Se guarda en `SiteSettings` (`pago_movil_account`).

## Analítica
* `POST /analytics/track` — el frontend solo lo llama con consentimiento de análisis; no se guarda IP ni user-agent.
* `GET /analytics/me` (médico) — «Estadísticas» del panel según el plan: Perfil Básico `NONE`; Profesional `BASIC` (visitas, WhatsApp y teléfono, últimos 30 días y total); Plus `FULL` (además clics en redes, mensajes y citas pedidas por estado); Premium y Marca Médica `ADVANCED` (además comparación con los 30 días anteriores y los últimos 6 meses).

## Notificaciones
* `GET /notifications?cursor=&limit=` · `GET /notifications/unread-count` · `PATCH /notifications/:id/read` · `PATCH /notifications/read-all` — avisos de la propia cuenta (nunca de otra).
* `GET|PUT /notifications/preferences` — correos opcionales de su tipo de cuenta (`{ emailOptOut: [...] }`).

## Valoraciones (`REVIEWS_ENABLED`; apagadas en producción)
* `GET /reviews/config` (público): `{ enabled, minForAverage }`. Con las valoraciones apagadas el resto responde 404 y la ficha no muestra promedio.
* `GET /reviews/professional/:slug?page=` (público): resumen (promedio y distribución desde 3) y opiniones publicadas con «Paciente verificado» o nombre e inicial, el mes de la consulta y la respuesta publicada.
* Paciente: `GET /reviews/me` (requisitos y médicos con consulta verificada), `POST /reviews` (`{ professionalId, rating, comment?, authorDisplay, acceptRules: true }`; 403 sin requisitos, 409 si ya opinó, 429 desde la cuarta del día), `PATCH /reviews/:id`, `DELETE /reviews/:id`.
* Médico: `GET /reviews/me/professional?page=`, `PUT|DELETE /reviews/:id/reply` (una respuesta, con moderación), `POST /reviews/:id/report` (`{ reason, details? }`, una por valoración).
