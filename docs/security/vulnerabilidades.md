# Gestión de vulnerabilidades

Estado: vigente desde el 2026-09-24 (ACT-0019) · Responsable: `merchandev`

## Qué se revisa y cuándo

| Fuente | Cuándo | Qué bloquea |
|---|---|---|
| `npm audit` de producción (backend y frontend) vía [`scripts/audit-gate.mjs`](../../scripts/audit-gate.mjs) | Cada push/PR y cada lunes (workflow **Seguridad**) | CRITICAL siempre; HIGH sin excepción vigente |
| Trivy sobre las imágenes `api` y `web` | Cada push/PR y cada lunes | CRITICAL con corrección publicada |
| Trivy de configuración (Dockerfiles, compose) | Cada push/PR | Informe en «Security and quality» |
| CodeQL (`security-extended`) | Cada push/PR | Alertas en «Security and quality» |
| gitleaks | Cada push/PR | Cualquier secreto en el historial |
| Dependabot | Mensual (agrupado) y alertas inmediatas | PRs de actualización a revisar |

## Política

- **CRITICAL:** nunca se acepta. Se corrige o se retira la dependencia antes de desplegar.
- **HIGH:** se corrige. Si no hay corrección compatible, se registra una **excepción temporal** en
  [`security/audit-exceptions.json`](../../security/audit-exceptions.json) con: advisory (GHSA), app, paquete,
  razón, componente afectado, exposición real, mitigación, **fecha límite** y responsable.
- **No hay excepciones indefinidas:** al vencer, el CI vuelve a fallar. Renovarla exige revisar de nuevo la exposición.
- **MODERATE/LOW:** se atienden en las actualizaciones mensuales de Dependabot.
- La puerta avisa cuando una excepción ya no hace falta, para retirarla.

## Excepciones vigentes

| Advisory | Paquete | Exposición | Vence |
|---|---|---|---|
| GHSA-ggr8-5vv4-36mx | `deepmerge-ts` (CLI de Prisma) | No alcanzable: solo fusiona la configuración propia del repo durante `prisma migrate deploy`. | 2026-12-31 |
| GHSA-3f6p-5ww8-9rcr | `mysql2` (CLI de Prisma) | No alcanzable: el proyecto usa PostgreSQL; el conector MySQL nunca se ejecuta. | 2026-12-31 |

La única corrección que ofrece npm para ambas es bajar la CLI de Prisma a 6.19.3 (incompatible con el cliente 7.10).
Se revisan en cada actualización de Prisma.

**Revisión del 2026-10-01 (ACT-0038):** sin cambios. Prisma 7.10.0 sigue siendo la última versión 7.x y la 8 solo
existe como *release candidate* (`8.0.0-rc.19`, etiquetada `latest` en npm): no se adopta una versión candidata en
producción. Volver a revisar cuando la 8 sea estable o salga una 7.x con la corrección.

## Herramientas de desarrollo

- **ESLint 9** (frontend, desde ACT-0037) figura como «sin soporte» en npm. Solo corre en desarrollo y en CI, nunca
  en la imagen de producción. Se usa la 9 porque `eslint-plugin-react` (dentro de `eslint-config-next`) todavía no
  admite la 10; pasar a la 10 cuando la admita.
