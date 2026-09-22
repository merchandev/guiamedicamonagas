# 🩺 Guía Médica Monagas

> Directorio médico digital para conectar a pacientes, profesionales de la salud y organizaciones sanitarias de Monagas en una plataforma confiable, verificable y preparada para crecer.

[![Estado](https://img.shields.io/badge/estado-MVP%20funcional-16a34a?style=flat-square)](Actualizaciones.md)
[![Rama](https://img.shields.io/badge/rama-main-2563eb?style=flat-square)](https://github.com/merchandev/guiamedicamonagas)
[![Frontend](https://img.shields.io/badge/frontend-Next.js%2016-000000?style=flat-square&logo=next.js)](frontend)
[![Backend](https://img.shields.io/badge/backend-NestJS%2011-e0234e?style=flat-square&logo=nestjs)](backend)
[![Base de datos](https://img.shields.io/badge/database-PostgreSQL%2016-336791?style=flat-square&logo=postgresql)](backend/prisma)

## 📖 Tabla de contenidos

- [Qué es](#-qué-es)
- [Objetivos](#-objetivos)
- [Estado actual](#-estado-actual)
- [Funcionalidades](#-funcionalidades)
- [Arquitectura](#-arquitectura)
- [Stack tecnológico](#-stack-tecnológico)
- [Estructura del repositorio](#-estructura-del-repositorio)
- [Requisitos](#-requisitos)
- [Puesta en marcha rápida](#-puesta-en-marcha-rápida)
- [Desarrollo local](#-desarrollo-local)
- [Variables de entorno](#-variables-de-entorno)
- [Servicios y puertos](#-servicios-y-puertos)
- [API](#-api)
- [Flujos principales](#-flujos-principales)
- [Seguridad y privacidad](#-seguridad-y-privacidad)
- [Comandos útiles](#-comandos-útiles)
- [Despliegue](#-despliegue)
- [Documentación relacionada](#-documentación-relacionada)
- [Roadmap](#-roadmap)
- [Contribución](#-contribución)
- [Licencia y uso](#-licencia-y-uso)

## 🌎 Qué es

Guía Médica Monagas es una plataforma full-stack enfocada en el descubrimiento de servicios de salud en el estado Monagas, Venezuela.

La solución permite:

- A pacientes y visitantes: encontrar médicos, especialidades, farmacias, laboratorios y clínicas.
- A profesionales: crear un perfil público, gestionar ubicaciones, publicar contenido y contratar un plan.
- A organizaciones: publicar información de farmacias, laboratorios o clínicas y administrar sus sedes.
- Al equipo administrador: revisar documentos, aprobar pagos, gestionar planes, controlar SEO y supervisar la operación.

El sistema combina páginas públicas optimizadas para buscadores con áreas privadas protegidas por autenticación y roles.

## 🎯 Objetivos

1. Centralizar la oferta médica y sanitaria de Monagas.
2. Aumentar la confianza mediante verificación documental y revisión administrativa.
3. Ofrecer perfiles claros, localizables y fáciles de contactar.
4. Habilitar un modelo sostenible de planes y servicios para profesionales y organizaciones.
5. Mantener una base preparada para analítica, notificaciones, aplicaciones móviles y nuevas integraciones.

## 🚦 Estado actual

El repositorio contiene un MVP funcional transversal con:

- Autenticación, roles, verificación de correo y recuperación de contraseña.
- Perfiles profesionales y organizaciones con ubicaciones.
- Verificación documental profesional para el contexto venezolano.
- Planes, funcionalidades por nivel y flujo de Pago Móvil con revisión administrativa.
- Tasa BCV sincronizable y precios dinámicos en bolívares.
- Panel de administración, analítica, auditoría, SEO, cookies y notificaciones.
- Frontend público, dashboards privados y sistema visual reutilizable.
- Entorno Docker con PostgreSQL, Redis, MinIO, Meilisearch, Mailpit y Caddy.

La bitácora completa de cambios está en [Actualizaciones.md](Actualizaciones.md).

> ⚠️ El proyecto está en etapa MVP. Antes de producción deben configurarse credenciales reales, dominios, almacenamiento, correo, WhatsApp, pagos, backups, observabilidad y una matriz final de permisos.

## ✨ Funcionalidades

### 🌐 Experiencia pública

- Homepage con propuesta de valor, búsqueda y llamadas a la acción.
- Directorio de médicos con perfiles públicos por slug.
- Directorio de organizaciones y sedes.
- Navegación por especialidades y sección de farmacias.
- Comparación de planes y formularios de contacto.
- Botones de contacto y enlaces de WhatsApp.
- Metadatos SEO, sitemap, robots, términos, privacidad y cookies.

### 👨‍⚕️ Área profesional

- Registro, inicio de sesión, verificación de correo y recuperación de contraseña.
- Gestión del perfil profesional, fotografía y datos públicos.
- Gestión de ubicaciones adicionales.
- Carga y consulta de documentos de verificación.
- Consulta de plan, estado de suscripción y registro de pagos.
- Publicaciones, mensajes, notificaciones y analítica de eventos.

### 🏥 Área de organizaciones

- Registro de farmacias, laboratorios y clínicas.
- Gestión de información pública y múltiples ubicaciones.
- Publicación y desactivación administrativa.

### 🛠️ Panel de administración

- Resumen de métricas.
- Gestión de médicos, organizaciones y especialidades.
- Cola de verificaciones documentales.
- Revisión y aprobación de pagos.
- Gestión de planes y niveles.
- Sincronización o ajuste manual de la tasa BCV.
- Configuración global de SEO, cookies, mensajes y trazabilidad.

### 💳 Planes disponibles

El backend define los niveles Básico, Profesional, Plus, Premium y Organización. Las capacidades se controlan desde <code>backend/src/subscriptions</code>, incluyendo publicaciones, ubicaciones adicionales y exposición dentro del directorio.

## 🏗️ Arquitectura

~~~mermaid
flowchart TB
    U[Visitantes, profesionales y administradores]
    WEB[Next.js 16 - App Router + SSR]
    API[NestJS 11 + Fastify - API REST]
    DB[(PostgreSQL 16 + Prisma 7)]
    CACHE[(Redis 7)]
    SEARCH[(Meilisearch)]
    STORAGE[(MinIO / S3)]
    MAIL[SMTP / Mailpit]
    EXT[BCV / WhatsApp]
    U --> WEB
    WEB --> API
    API --> DB
    API --> CACHE
    API --> SEARCH
    API --> STORAGE
    API --> MAIL
    API --> EXT
~~~

| Capa | Implementación | Responsabilidad |
|---|---|---|
| Presentación | Next.js, React, Tailwind, Framer Motion | Páginas públicas, dashboard, administración y UI |
| API | NestJS, Fastify, TypeScript | Autenticación, reglas de negocio y endpoints REST |
| Persistencia | PostgreSQL, Prisma | Usuarios, perfiles, organizaciones, planes, pagos y métricas |
| Servicios auxiliares | Redis, Meilisearch, MinIO | Caché, búsqueda, archivos y comprobantes privados |
| Integraciones | SMTP/Mailpit, WhatsApp, BCV | Correo, notificaciones y sincronización de tasa |
| Entrega | Docker Compose, Caddy | Orquestación, reverse proxy y HTTPS |

Consulta [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) para la descripción ampliada.

## 🧰 Stack tecnológico

| Componente | Tecnología |
|---|---|
| Frontend | Next.js 16, React 18, TypeScript, Tailwind CSS |
| UI y UX | Framer Motion, React Hook Form, Zod |
| Backend | NestJS 11, Fastify, TypeScript |
| Seguridad | JWT, Passport, bcryptjs, Helmet, throttling y cookies seguras |
| Base de datos | PostgreSQL 16, Prisma 7 |
| Caché | Redis 7 |
| Búsqueda | Meilisearch 1.10 |
| Archivos | MinIO compatible con S3 |
| Correo local | Mailpit |
| Proxy | Caddy 2 |
| Contenedores | Docker y Docker Compose |

## 🗂️ Estructura del repositorio

~~~text
.
├── backend/
│   ├── prisma/                 # Esquema, migraciones y seed
│   └── src/                    # Módulos NestJS y API
├── frontend/
│   └── src/
│       ├── app/                # Rutas App Router
│       ├── components/         # UI, layouts, motion e ilustraciones
│       └── lib/                # API client, tipos, auth y utilidades
├── docs/                       # Arquitectura, endpoints y roadmap
├── scripts/                    # Automatización de despliegue
├── .env.example                # Plantilla de configuración
├── Caddyfile                   # Reverse proxy de producción
├── docker-compose.yml          # Perfiles dev y prod
├── Actualizaciones.md          # Bitácora de cambios
└── README.md                   # Esta guía
~~~

## ✅ Requisitos

- Git.
- Node.js 20 o superior y npm.
- Docker Desktop con Docker Compose.
- PostgreSQL si se decide trabajar sin contenedores.
- Credenciales externas solo para integraciones reales: SMTP, WhatsApp, S3/MinIO y dominio.

## 🚀 Puesta en marcha rápida

### 1. Clonar y configurar

~~~bash
git clone https://github.com/merchandev/guiamedicamonagas.git
cd guiamedicamonagas
~~~

En PowerShell:

~~~powershell
Copy-Item .env.example .env
~~~

En macOS/Linux:

~~~bash
cp .env.example .env
~~~

Para desarrollo, cambia JWT_SECRET, JWT_REFRESH_SECRET y COOKIE_SECRET por valores locales propios de 32 caracteres o más.

### 2. Levantar dependencias

El perfil dev inicia PostgreSQL, Redis, Meilisearch, MinIO y Mailpit:

~~~bash
docker compose --profile dev up -d
~~~

### 3. Preparar el backend

~~~bash
cd backend
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
~~~

Para diseñar una migración nueva durante el desarrollo, utiliza <code>npm run prisma:migrate</code>.

### 4. Preparar el frontend

En otra terminal:

~~~bash
cd frontend
npm ci
npm run dev
~~~

La aplicación estará en [http://localhost:3000](http://localhost:3000) y la API en [http://localhost:4000/api/v1](http://localhost:4000/api/v1).

## 💻 Desarrollo local

### Frontend

~~~bash
cd frontend
npm run dev
npm run build
npm run start
npm run lint
~~~

### Backend

~~~bash
cd backend
npm run start:dev
npm run build
npm run start:prod
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run prisma:seed
~~~

### Stack integrado

El perfil prod construye la API, el frontend y Caddy junto con las dependencias:

~~~bash
docker compose --profile prod up -d --build
~~~

Configura primero secretos y URLs de producción en .env; no uses valores de ejemplo en Internet.

## 🔐 Variables de entorno

La referencia completa está en [.env.example](.env.example).

| Grupo | Variables principales |
|---|---|
| Aplicación | NODE_ENV, PORT, FRONTEND_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL |
| PostgreSQL | DB_USER, DB_PASSWORD, DB_NAME, DATABASE_URL |
| Redis | REDIS_HOST, REDIS_PORT |
| Meilisearch | MEILI_HOST, MEILI_MASTER_KEY |
| Archivos | S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY |
| Sesiones | JWT_SECRET, JWT_EXPIRATION, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRATION_DAYS, COOKIE_SECRET |
| Correo | SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM |
| WhatsApp | WHATSAPP_ENABLED, WHATSAPP_API_VERSION, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN |
| Pago Móvil | PAGO_MOVIL_BANK_NAME, PAGO_MOVIL_BANK_CODE, PAGO_MOVIL_PHONE, PAGO_MOVIL_ID |

Nunca subas .env, tokens, contraseñas, comprobantes, documentos de verificación ni credenciales de proveedores al repositorio.

## 🔌 Servicios y puertos

| Servicio | URL / puerto local | Uso |
|---|---|---|
| Frontend | [localhost:3000](http://localhost:3000) | Aplicación web |
| API | [localhost:4000](http://localhost:4000) | Backend NestJS |
| PostgreSQL | localhost:5432 | Base de datos |
| Redis | localhost:6379 | Caché |
| Meilisearch | [localhost:7700](http://localhost:7700) | Búsqueda |
| MinIO API | [localhost:9000](http://localhost:9000) | Almacenamiento S3 |
| MinIO Console | [localhost:9001](http://localhost:9001) | Administración de archivos |
| Mailpit SMTP | localhost:1025 | Correo local |
| Mailpit Web | [localhost:8025](http://localhost:8025) | Bandeja de pruebas |
| Caddy | localhost:80/443 | Proxy del perfil prod |

## 🔗 API

La API utiliza el prefijo <code>/api/v1</code>. El listado base está en [docs/ENDPOINTS.md](docs/ENDPOINTS.md).

| Dominio | Ejemplos |
|---|---|
| Salud | GET /health |
| Auth | POST /auth/register, /auth/login, /auth/refresh, /auth/logout |
| Profesionales | GET /professionals, GET /professionals/:slug, PATCH /professionals/me |
| Organizaciones | GET /organizations, GET /organizations/:slug |
| Especialidades | GET /specialties, GET /specialties/:slug |
| Documentos | GET /documents/requirements, POST /documents y revisión administrativa |
| Suscripciones | GET /subscriptions/plans, GET /subscriptions/me |
| Pagos | POST /payments, cola administrativa y revisión |
| Publicaciones | GET /posts/me, POST /posts, PATCH /posts/:id |
| Notificaciones | GET /notifications y marcar como leída |
| Analítica | POST /analytics/track, GET /analytics/me |
| SEO | Configuración global y metadatos de páginas |

## 🔄 Flujos principales

### Registro y acceso

~~~mermaid
sequenceDiagram
    actor Usuario
    participant Web as Frontend
    participant API as API NestJS
    participant DB as PostgreSQL
    participant Mail as SMTP/Mailpit
    Usuario->>Web: Completa registro
    Web->>API: POST /auth/register
    API->>DB: Crea usuario y tokens
    API->>Mail: Envía verificación
    API-->>Web: Respuesta de registro
    Usuario->>Web: Confirma correo
    Web->>API: GET /auth/verify-email
    API-->>Web: Cuenta habilitada
~~~

### Verificación y monetización

~~~mermaid
flowchart LR
    P[Profesional] --> DOC[Carga documentos]
    DOC --> Q[Cola administrativa]
    Q --> REV[Revisión y decisión]
    REV --> PUB[Perfil publicable]
    P --> PLAN[Selecciona plan]
    PLAN --> RATE[Tasa BCV]
    RATE --> PAY[Reporta Pago Móvil]
    PAY --> APPR[Aprobación admin]
    APPR --> ACTIVE[Plan activo]
~~~

## 🛡️ Seguridad y privacidad

- Los secretos se inyectan por variables de entorno y no deben versionarse.
- JWT y refresh tokens tienen secretos y expiraciones independientes.
- Los endpoints privados utilizan guards y roles.
- Los documentos y comprobantes se almacenan en un bucket privado compatible con S3.
- Las descargas privadas deben entregarse mediante URLs firmadas y de duración limitada.
- Helmet y throttling forman parte de la protección de la API.
- Las acciones relevantes deben conservar trazabilidad mediante auditoría.
- Antes de producción se deben revisar CORS, cookies Secure/HttpOnly, límites de carga, backups, rotación de secretos y retención.

> Este proyecto maneja potencialmente información profesional, documentos de identidad y comprobantes de pago. La configuración de desarrollo no debe reutilizarse tal cual en producción.

## 🧪 Comandos útiles

~~~bash
docker compose --profile dev logs -f
docker compose ps
docker compose --profile dev down
docker compose --profile dev down -v
git status
git log --oneline --decorate --graph
~~~

## 🚢 Despliegue

El despliegue de referencia utiliza Docker Compose con el perfil prod y Caddy como reverse proxy.

1. Configura un servidor con Docker y Docker Compose.
2. Clona el repositorio.
3. Crea .env con valores de producción y secretos fuertes.
4. Ajusta el dominio en [Caddyfile](Caddyfile).
5. Ejecuta las migraciones Prisma antes de poner el sistema en servicio.
6. Construye y levanta el stack:

   ~~~bash
   docker compose --profile prod up -d --build
   ~~~

7. Revisa logs, salud de <code>/api/v1/health</code>, correo, almacenamiento, backups y renovación HTTPS.

El script [scripts/deploy.sh](scripts/deploy.sh) contiene la automatización inicial disponible; debe revisarse y adaptarse al entorno concreto antes de usarlo en producción.

## 📚 Documentación relacionada

| Documento | Contenido |
|---|---|
| [Actualizaciones.md](Actualizaciones.md) | Registro cronológico y por área de cambios |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Componentes, stack y flujo de datos |
| [docs/ENDPOINTS.md](docs/ENDPOINTS.md) | Endpoints principales de la API |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Evolución planificada del producto |
| [.env.example](.env.example) | Variables de entorno y servicios |
| [docker-compose.yml](docker-compose.yml) | Perfiles dev y prod |

## 🗺️ Roadmap

### Corto plazo

- Validación integral de build, migraciones y servicios Docker.
- Pruebas de registro, verificación, pagos y aprobación.
- Revisión de permisos por rol y documentos privados.
- Configuración de credenciales reales de correo, S3/MinIO, WhatsApp y BCV.
- Pruebas unitarias, de integración y de extremo a extremo.

### Mediano plazo

- Integración completa del buscador con Meilisearch.
- Dashboard de analítica más profundo.
- Mejoras de observabilidad, auditoría y reportes.
- Hardening de producción, backups y recuperación ante desastres.

### Expansión

- Aplicaciones móviles con React Native/Expo.
- Sistema de reservas y turnos.
- Notificaciones push.
- Nuevas integraciones de pagos y servicios de salud.

## 🤝 Contribución

1. Crea una rama descriptiva desde main.
2. Mantén los cambios enfocados y no incluyas secretos.
3. Actualiza [Actualizaciones.md](Actualizaciones.md) con fecha, hora, impacto y evidencia.
4. Ejecuta las validaciones relevantes del frontend, backend y Prisma.
5. Usa mensajes de commit claros, por ejemplo: <code>feat(auth): agrega verificacion de correo</code>.
6. Abre un pull request con contexto, capturas o pruebas cuando aplique.

## 📜 Licencia y uso

El paquete del backend declara UNLICENSED. Este repositorio es público para facilitar su consulta y colaboración, pero el uso, redistribución o explotación comercial del código debe contar con autorización del propietario del proyecto.

## 👤 Mantenimiento

Proyecto mantenido por [Merchan.dev](https://github.com/merchandev).

<p align="center">
  <sub>🩺 Guía Médica Monagas · Tecnología para encontrar y gestionar servicios de salud</sub><br>
  <a href="Actualizaciones.md">Ver bitácora de actualizaciones →</a>
</p>
