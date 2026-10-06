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
* `POST /analytics/search-appearances` (público, con consentimiento de análisis): `{ professionalIds, specialty?, municipality? }` — suma una aparición por médico publicado, por día de Caracas y filtro (solo valores de las listas del sitio; nunca el texto buscado).
* `GET /analytics/me` (médico) — también `searches` desde el plan Profesional (apariciones de los últimos 30 días, por especialidad y municipio). «Estadísticas» del panel según el plan: Perfil Básico `NONE`; Profesional `BASIC` (visitas, WhatsApp y teléfono, últimos 30 días y total); Plus `FULL` (además clics en redes, mensajes y citas pedidas por estado); Premium y Marca Médica `ADVANCED` (además comparación con los 30 días anteriores y los últimos 6 meses).

## Notificaciones
* `GET /notifications?cursor=&limit=` · `GET /notifications/unread-count` · `PATCH /notifications/:id/read` · `PATCH /notifications/read-all` — avisos de la propia cuenta (nunca de otra).
* `GET|PUT /notifications/preferences` — correos opcionales de su tipo de cuenta (`{ emailOptOut: [...] }`).

## Valoraciones (`REVIEWS_ENABLED`; apagadas en producción)
* `GET /reviews/config` (público): `{ enabled, minForAverage }`. Con las valoraciones apagadas el resto responde 404 y la ficha no muestra promedio.
* `GET /reviews/professional/:slug?page=` (público): resumen (promedio y distribución desde 3) y opiniones publicadas con «Paciente verificado» o nombre e inicial, el mes de la consulta y la respuesta publicada.
* Paciente: `GET /reviews/me` (requisitos y médicos con consulta verificada), `POST /reviews` (`{ professionalId, rating, comment?, authorDisplay, acceptRules: true }`; 403 sin requisitos, 409 si ya opinó, 429 desde la cuarta del día), `PATCH /reviews/:id`, `DELETE /reviews/:id`.
* Médico: `GET /reviews/me/professional?page=`, `PUT|DELETE /reviews/:id/reply` (una respuesta, con moderación), `POST /reviews/:id/report` (`{ reason, details? }`, una por valoración).
* Admin (`MODERATE_REVIEWS`): `GET /reviews/admin?tab=PENDING|REPLIES|REPORTED|PUBLISHED|WITHDRAWN|REJECTED&search=&rating=&page=` (sin la identidad del autor), `GET /reviews/admin/:id` (caso, denuncias y sanciones), `PATCH /reviews/admin/:id/approve|reject|withdraw|restore` (`{ reason }` para rechazar y retirar), `POST /reviews/admin/:id/delete` (`{ reason, confirm: "ELIMINAR" }`), `PATCH /reviews/admin/:id/reply` (`{ action: APPROVE|REJECT|WITHDRAW|RESTORE, reason? }`), `PATCH /reviews/admin/reports/:reportId` (`{ status: UPHELD|DISMISSED, note }`), `POST /reviews/admin/authors/:patientId/withdraw-all` (`{ reason }`).
* Admin (`MODERATE_REVIEWS` y bóveda de pacientes abierta): `GET /patients/admin/reviews/:id/author` — nombre, código y otras valoraciones del autor (auditado como `REVIEW_AUTHOR_VIEWED`).
* Sanciones (`MODERATE_REVIEWS`; las de la cuenta exigen además `MANAGE_ACCOUNTS`): `GET /reviews/admin/sanctions?userId=`, `POST /reviews/admin/sanctions` (`{ userId, type: REVIEWS|ACCOUNT, days: 1-365 | indefinite: true (solo REVIEWS), reason, reviewId? }`), `PATCH /reviews/admin/sanctions/:id` (nueva duración desde hoy), `PATCH /reviews/admin/sanctions/:id/lift` (`{ reason }`). Con una suspensión de cuenta vigente, `POST /auth/login` responde 403 `ACCOUNT_SUSPENDED_UNTIL` con la fecha y el motivo, y los tokens existentes responden 401.

## Mensajes y pedidos de contacto
* `POST /contact` (público) — formulario de la ficha sin cuenta. `GET /contact/me` y `PATCH /contact/:id/read` (médico) — su bandeja, con los pedidos.
* Paciente: `GET /contact/requests/prefill` (su nombre, teléfono y correo para precargar), `POST /contact/requests` (`{ professionalSlug, shareName, phone?, shareEmail, channel: PHONE|WHATSAPP|EMAIL, preferredTime?, message, acceptConsent: true }`; correo verificado, médico con plan que recibe mensajes, uno abierto por médico, cinco por día), `GET /contact/requests/me`, `PATCH /contact/requests/:id/withdraw` (borra los datos compartidos).
* Médico: `PATCH /contact/requests/:id/status` (`{ status: CONTACTED|CLOSED }`). Los pedidos vencen a los 30 días y sus datos se borran (tarea cada hora).

## Récipes digitales (`PRESCRIPTIONS_ENABLED`; apagados en producción)
* `GET /prescriptions/config` (público) — `{ enabled, rulesVersion, maxItems }`. Con el interruptor apagado, el resto responde 404.
* Público, para quien tiene el código (paciente o farmacia; el código va en el cuerpo, nunca en la URL): `POST /prescriptions/verify` (`{ code }`: el récipe, su estado VALID|EXPIRED|ANNULLED y si la huella coincide; nunca el motivo de una anulación) y `POST /prescriptions/verify/pdf` (el PDF).
* Médico, talonario: `GET /prescriptions/pad` (sus datos verificados, el establecimiento, las imágenes y `missing`: lo que le falta para emitir), `PATCH /prescriptions/pad` (`{ establishmentName?, establishmentAddress?, establishmentRif?, establishmentPhone?, city?, defaultValidityDays?, acceptRules? }`), `POST|DELETE /prescriptions/pad/:kind` (`signature|seal|logo`, multipart; firma y sello con el fondo claro vuelto transparente) y `GET /prescriptions/pad/preview` (PDF de muestra).
* Médico, récipes: `GET /prescriptions/patients` (pacientes con cuenta de su directorio), `GET /prescriptions?page&q`, `POST /prescriptions` (`{ patientId?, patientName, patientCedula? | guardianName + guardianCedula, patientBirthYear, items: [{ activeIngredient, concentration, pharmaceuticalForm, route, dose, duration, quantity?, brandNames?, nonSubstitutable, instructions? }] (1 a 8), pharmacistNotes?, patientInstructions?, validityDays }`; solo verificado, con N° MPPS, cédula, condiciones, establecimiento, firma y sello), `GET /prescriptions/:id`, `GET /prescriptions/:id/pdf`, `POST /prescriptions/:id/annul` (`{ reason }`), `POST /prescriptions/:id/email` (`{ email }`, con el PDF adjunto; máximo 5 por récipe) y `POST /prescriptions/:id/deliver` (`{ patientId }`).
* Paciente: `GET /prescriptions/me`, `GET /prescriptions/me/:id`, `GET /prescriptions/me/:id/pdf` y `POST /prescriptions/claim` (`{ code }`: lo agrega a su cuenta si la cédula impresa es la suya).
