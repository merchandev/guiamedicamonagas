# Endpoints de la API - v1

Todos los endpoints tienen como prefijo base `/api/v1`.

## Core
*   `GET /health` - Estado de los servicios (Postgres, Redis, Meilisearch).

## Autenticación
*   `POST /auth/register` - Registro de usuario base.
*   `POST /auth/login` - Inicio de sesión (Devuelve Access Token y Refresh Token).
*   `POST /auth/refresh` - Renovar token de acceso.
*   `POST /auth/logout` - Cerrar sesión.

## Profesionales (Médicos)
*   `GET /professionals` - Listado paginado de médicos aprobados.
*   `GET /professionals/:slug` - Detalle público de un médico.
*   `PATCH /professionals/me` - Actualización de ficha propia (Privado).
*   `POST /professionals/verify` - Enviar documentos KYC (Privado).

## Organizaciones (Farmacias / Laboratorios)
*   `GET /organizations` - Listado de clínicas o farmacias.
*   `GET /organizations/:slug` - Detalle de organización.

## Especialidades
*   `GET /specialties` - Listado de especialidades médicas.

## Membresías y Pagos
*   `GET /plans` - Ver planes de suscripción.
*   `POST /payments` - Registrar un nuevo pago (Ej: Comprobante Pago Móvil).

*(Nota: Estos endpoints se implementarán en el código base durante el desarrollo del MVP).*
