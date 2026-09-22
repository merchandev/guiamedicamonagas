# =============================================================================
# docs/security/sec-01-infrastructure-hardening.md
# SEC-01 — Infrastructure Hardening
# Estado: COMPLETADO  |  Fecha: 2026-09-22
# Normas: ISO 27001:2022 A.8.1 · OWASP ASVS 5.0 §1 · NIST SSDF PO.5
# =============================================================================

## Objetivo

Garantizar que ningún servicio interno (base de datos, caché, búsqueda,
almacenamiento) quede expuesto a Internet directamente, y que las imágenes
de contenedor, credenciales y privilegios de ejecución cumplan el principio
de mínimo privilegio.

## Hallazgos previos resueltos

| # | Hallazgo | Impacto previo | Control aplicado |
|---|----------|----------------|-----------------|
| 1 | PostgreSQL (5432) accesible al host | Crítico | Eliminado en prod; red interna |
| 2 | Redis (6379) accesible al host | Crítico | Eliminado en prod; contraseña obligatoria |
| 3 | Meilisearch (7700) accesible al host | Crítico | Eliminado en prod; red interna |
| 4 | MinIO API (9000) accesible al host | Crítico | Eliminado en prod; red interna |
| 5 | MinIO Console (9001) accesible al host | Crítico | Eliminado en prod (acceso solo VPN) |
| 6 | API (4000) accesible al host | Crítico | Eliminado en prod; solo via Caddy |
| 7 | Web (3000) accesible al host | Alto | Eliminado en prod; solo via Caddy |
| 8 | `DB_PASSWORD=password` fallback | Crítico | Sin fallbacks en prod; deploy.sh falla |
| 9 | `MEILI_MASTER_KEY=dev_master_key_123` | Crítico | Sin fallbacks en prod; deploy.sh falla |
| 10 | API usa credenciales root de MinIO | Crítico | Usuario de servicio limitado (minio-init.sh) |
| 11 | Contenedores ejecutan como root | Alto | `USER node` en Dockerfiles |
| 12 | Imágenes con `:latest` (no fijadas) | Medio | Versiones fijadas en todos los compose |
| 13 | Sin Redis auth | Alto | `requirepass` obligatorio en prod |

## Arquitectura resultante

```
         INTERNET
            │
        80 / 443
            │
          CADDY (gmm_dmz)
     ┌──────┴──────┐
     │             │
  web:3000      api:4000
  (gmm_dmz)   (gmm_dmz + gmm_internal)
                   │
     ┌─────────────┼──────────────┐
     │             │              │
 postgres       redis          minio
 (internal)   (internal)    (internal)
                              meilisearch
                              (internal)

gmm_internal → driver: bridge, internal: true → sin salida a Internet
gmm_dmz      → solo Caddy, api, web
```

## Archivos modificados / creados

| Archivo | Cambio |
|---------|--------|
| `docker-compose.prod.yml` | **[NEW]** Producción endurecida: redes internas, sin puertos al host para servicios internos |
| `docker-compose.dev.yml` | **[NEW]** Desarrollo: puertos al 127.0.0.1 solamente, versiones fijadas |
| `docker-compose.yml` | Original mantenido para referencia; usar `dev.yml` en local |
| `Caddyfile` | Headers de seguridad: HSTS, X-Frame-Options, CSP, Referrer-Policy, logs JSON |
| `backend/Dockerfile` | `USER node`, `dumb-init`, imagen fijada `node:24.9-alpine` |
| `frontend/Dockerfile` | `USER node`, `dumb-init`, imagen fijada `node:24.9-alpine` |
| `scripts/deploy.sh` | Valida vars requeridas, bloquea defaults inseguros, usa `docker-compose.prod.yml` |
| `scripts/minio-init.sh` | **[NEW]** Crea bucket privado + usuario de servicio con permisos mínimos |
| `.env.example` | Documentación clara de prod vs dev, `REDIS_PASSWORD`, marcadores `CHANGE_ME` |
| `backend/src/config/env.validation.ts` | `noInsecureDefault()` bloquea secrets débiles en `NODE_ENV=production` |

## Pasos de verificación

### Verificar que ningún servicio interno escucha en el host (producción)
```bash
# Después de `bash scripts/deploy.sh`, desde el host del servidor:
ss -tlnp | grep -E '5432|6379|7700|9000|9001|4000|3000'
# Resultado esperado: NINGUNA línea (solo 80 y 443 de Caddy)
```

### Verificar que los contenedores no corren como root
```bash
docker inspect gmm_api --format '{{.Config.User}}'   # → node
docker inspect gmm_web --format '{{.Config.User}}'   # → node
```

### Verificar que la red interna no tiene acceso externo
```bash
docker network inspect gmm_internal | grep '"Internal"'
# → "Internal": true
```

### Verificar que MinIO rechaza acceso anónimo
```bash
curl -s http://localhost:9000/guiamedica/  # solo accesible internamente
# Desde fuera del servidor → connection refused / 404
```

## Próximas etapas

- **SEC-02** — Authentication: Argon2id, MFA, familias de sesiones, reuse detection
- **SEC-03** — Authorization: permisos granulares, eliminar bypass SUPERADMIN
- **SEC-04** — Upload Security: magic bytes, ClamAV, re-encode imágenes
