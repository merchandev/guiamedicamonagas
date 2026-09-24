# SEC-02 a SEC-05 — Privacidad del paciente, acceso y archivos

Estado: implementado · Fecha: 2026-09-23 (ampliado el 2026-09-24, ACT-0016) · Origen: auditoría externa del 2026-09-23 (ver `Actualizaciones.md`, ACT-0015 y ACT-0016)

## Resumen de controles

| Control | Qué hace | Dónde |
|---|---|---|
| SEC-05 Cifrado de campos | Cédula, teléfono, datos de salud del paciente y motivo de consulta se guardan con AES-256-GCM (IV aleatorio, AAD por campo, llavero versionado). Unicidad y búsqueda exacta por HMAC-SHA256 con clave separada. | `backend/src/crypto/field-encryption.service.ts`, `backend/src/patients/patient-data.codec.ts` |
| Consentimiento paciente → médico | `PatientDataGrant`: alcance (IDENTITY/CONTACT/HEALTH), vencimiento, revocación, versión del texto. Sin grant vigente el médico solo ve el código `GMM-XXXX`. Cada lectura se audita (`PATIENT_DATA_READ`). | `backend/src/patients/patients.service.ts` |
| Analítica sin rastreo | Solo con consentimiento de análisis del visitante; el servidor ya no guarda IP ni user-agent. | `frontend/src/lib/analytics.ts`, `backend/src/analytics` |
| SEC-04 Subidas | Tipo real por magic bytes, re-codificación de imágenes con sharp (sin EXIF/GPS ni datos anexados), PDF con contenido activo rechazados, antivirus ClamAV opcional (falla cerrado). | `backend/src/uploads` |
| SEC-03 Autorización | Permisos por función (`VERIFY_PROFESSIONALS`, `REVIEW_PAYMENTS`, `MANAGE_PLANS`, …); sin bypass universal de SUPERADMIN. | `backend/src/common/permissions.ts`, `backend/src/common/guards/roles.guard.ts` |
| SEC-02 Sesiones | Detección de reutilización de refresh tokens (revoca todas las sesiones), segundo factor por correo para ADMIN/SUPERADMIN (activable con `ADMIN_MFA_ENABLED=true`). `tokenVersion` en cada access token: cambio o restablecimiento de contraseña, "cerrar todas las sesiones" y reuso de refresh token invalidan al instante los access tokens vigentes; el rol se lee de la base de datos en cada petición. | `backend/src/auth/auth.service.ts`, `backend/src/auth/strategies/jwt.strategy.ts` |
| Identidad del paciente | Cola administrativa con permiso `VERIFY_PATIENT_IDENTITY`: la lista no muestra cédulas; abrir un caso descifra la cédula y firma la foto 5 minutos (auditado `PATIENT_IDENTITY_VIEWED`). Rechazar exige motivo y borra la foto. | `backend/src/patients/patient-identity-admin.controller.ts` |
| Imágenes de contenedor | Runtime sin npm/yarn/corepack ni dependencias de desarrollo, parches de Alpine aplicados en el build; Trivy bloquea CVE críticas corregibles en `api` y `web`. | `backend/Dockerfile`, `frontend/Dockerfile`, `.github/workflows/security.yml` |
| Legal versionado | Versión de Términos/Privacidad aceptada por usuario; re-aceptación obligatoria al cambiar la versión. | `backend/src/common/legal-versions.ts`, `frontend/src/lib/legal.ts` |

## Custodia de claves (LEER ANTES DE TOCAR `.env.prod`)

Las claves `DATA_ENCRYPTION_KEYS` y `DATA_LOOKUP_KEY` viven solo en el entorno del contenedor `api` (archivo `.env.prod` del VPS), nunca en PostgreSQL ni en Git.

- **Si se pierden, los datos cifrados de pacientes son irrecuperables.** Guardar una copia en un gestor de contraseñas o bóveda fuera del VPS, separada de los respaldos de la base de datos.
- Un respaldo de la base de datos sin las claves no permite leer cédulas, teléfonos ni datos de salud: por eso no deben guardarse juntos.

### Rotación

1. Generar una clave nueva: `echo "v2:$(openssl rand -base64 32)"`.
2. Agregarla al llavero sin quitar la anterior: `DATA_ENCRYPTION_KEYS=v1:...,v2:...` y `DATA_ENCRYPTION_ACTIVE_KEY=v2`.
3. Reiniciar `api`. Todo lo nuevo se cifra con `v2`; lo antiguo sigue legible con `v1`.
4. Re-cifrar en segundo plano los valores con `needsRotation()` y, cuando ninguno use `v1`, retirarla del llavero.

`DATA_LOOKUP_KEY` no se rota sin recalcular todos los `cedulaLookup`/`phoneLookup` (cambiarla rompe la unicidad y la búsqueda exacta).

## Límites conocidos

- La detección de contenido activo en PDF no descomprime flujos de objetos; se compensa sirviendo siempre los documentos como descarga y con ClamAV cuando esté habilitado (`CLAMAV_HOST`). Un contenedor ClamAV necesita ~1 GB de RAM: evaluarlo antes de activarlo en el VPS compartido.
- El segundo factor por correo está desactivado mientras producción use el Mailpit interno (el código no llegaría a ningún buzón). Activar con SMTP real.
- Nombre y apellido del paciente no se cifran (se usan en saludos de correo); no se muestran al médico sin grant `IDENTITY`.
- `ClinicalNote` y `FinanceRecord` siguen sin endpoints: cualquier módulo futuro de historia clínica debe cifrar sus campos con `FieldEncryptionService` y apoyarse en `PatientDataGrant`.
