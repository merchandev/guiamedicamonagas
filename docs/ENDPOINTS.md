# Endpoints de la API - v1

Todos los endpoints tienen como prefijo base `/api/v1`. Salvo los marcados como
públicos, requieren `Authorization: Bearer <access token>`. Los endpoints
administrativos exigen un **permiso** concreto (ver `backend/src/common/permissions.ts`),
no solo el rol.

## Core
* `GET /health` — estado de la API (público).

## Autenticación
* `POST /auth/register` — registro de paciente, médico u organización; exige `acceptLegal: true` (público).
* `POST /auth/login` — inicio de sesión; con `ADMIN_MFA_ENABLED` un administrador recibe `{ mfaRequired, challengeToken }` (público).
* `POST /auth/mfa/verify` — código de 6 dígitos del segundo factor (público).
* `POST /auth/refresh` · `POST /auth/logout` — sesión por cookie httpOnly; un refresh token reutilizado revoca todas las sesiones.
* `GET /auth/me` — usuario, permisos, organizaciones y si debe re-aceptar los textos legales.
* `POST /auth/accept-legal` — acepta las versiones vigentes de Términos y Privacidad.

## Pacientes (ficha propia, cifrada)
* `GET /patients/me` · `PATCH /patients/me` — ficha y datos de salud.
* `POST /patients/me/photo` · `POST /patients/me/id-photo` — fotos (verificadas y re-codificadas).
* `GET /patients/me/grants` · `POST /patients/me/grants` · `DELETE /patients/me/grants/:id` — autorizaciones a médicos.
* `GET /patients/me/professionals` — médicos con los que tuvo citas.

## Citas
* `GET /appointments/availability` (público) · `POST /appointments` (acepta `shareScopes`/`shareDays`) · `GET /appointments/me`.
* Médico: `GET /appointments/me/agenda`, `GET /appointments/me/patients`, `POST /appointments/me/patients/:id/data` (solo con autorización vigente, auditado), `POST /appointments/me/patients/:id/access-request`.

## Profesionales
* `GET /professionals` (público; incluye `featured`) · `GET /professionals/:slug` (público).
* `GET /professionals/sitemap?page=` · `GET /professionals/landing-pages` (públicos, SEO).
* `GET|PATCH /professionals/me`, `POST /professionals/me/photo`, sedes y redes.

## Organizaciones
* `GET /organizations` · `GET /organizations/:slug` (públicos; solo verificadas).
* Autogestión (rol ORGANIZATION): `GET /organizations/me/list`, `GET|PUT /organizations/me/:id`, logo, miembros, médicos asociados, estadísticas.
* Médico: `GET /organizations/affiliations/me`, `PATCH /organizations/affiliations/me/:organizationId`.
* Admin (`MANAGE_ORGANIZATIONS`): `GET /organizations/admin/list`, `PATCH /organizations/admin/:id/review`, CRUD.

## Geografía y catálogos
* `GET /geo/states` · `GET /geo/municipalities?state=` · `GET /geo/municipalities/:id/parishes` (públicos).
* `GET /payments/banks` (público); admin (`MANAGE_CATALOG`): `/geo/admin/*`, `/payments/admin/banks`.

## Suscripciones y pagos
* `GET /subscriptions/plans` · `GET /subscriptions/exchange-rate` (públicos).
* `GET|POST /subscriptions/me` (médico) · `GET|POST /subscriptions/organizations/:id` (organización).
* `POST /payments` — reporte de Pago Móvil con comprobante (médico u organización).
* Admin: cola, comprobante y revisión (`REVIEW_PAYMENTS`); planes y tasa manual (`MANAGE_PLANS`).

## Analítica
* `POST /analytics/track` — el frontend solo lo llama con consentimiento de análisis; no se guarda IP ni user-agent.
