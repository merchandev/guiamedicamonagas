# Arquitectura - Guía Médica Monagas

Este documento describe la arquitectura base implementada en la Fase 1.

## Stack Tecnológico

*   **Frontend**: Next.js 16 (App Router), React 19, TailwindCSS.
*   **Backend**: NestJS 11, Fastify, TypeScript.
*   **Base de Datos**: PostgreSQL 16/18.
*   **ORM**: Prisma 7 (con soporte para PostgreSQL Adapter).
*   **Caché y Colas**: Redis 7/8.
*   **Motor de Búsqueda**: Meilisearch.
*   **Almacenamiento de Archivos**: MinIO (S3 compatible).
*   **Proxy / HTTPS**: Caddy.

## Componentes y Roles

1.  **API (NestJS)**: Sirve como backend centralizado. Todos los clientes (Web, iOS, Android) se conectan a esta API. Expone endpoints bajo `/api/v1`.
2.  **Web (Next.js)**: Aplicación SSR orientada al SEO. Renderiza perfiles de médicos y farmacias para indexación en Google.
3.  **Base de Datos Relacional**: Almacena usuarios, perfiles, membresías, verificaciones y métricas analíticas.
4.  **Buscador**: Meilisearch indexa a los médicos por nombre, especialidad y ubicación para ofrecer una búsqueda de autocompletado ultrarrápida.
5.  **Storage**: MinIO guarda las fotografías, comprobantes de pago y documentos privados de verificación KYC (IdentityVerification).

## Flujo de Datos

*   **Público**: Un visitante entra a `/medicos`. Next.js consulta la API internamente. La API busca en PostgreSQL o Redis y responde.
*   **Privado**: Un médico sube una foto. NestJS valida el archivo, lo sube a MinIO y guarda la URL en PostgreSQL. Los comprobantes médicos generan URLs firmadas de tiempo limitado.
