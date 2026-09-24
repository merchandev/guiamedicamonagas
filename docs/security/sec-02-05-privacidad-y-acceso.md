# SEC-02 a SEC-05 — Privacidad del paciente, acceso y archivos

Estado: implementado · Fecha: 2026-09-23 (ampliado el 2026-09-24, ACT-0016 y ACT-0019) · Origen: auditoría externa del 2026-09-23 y plan de producción del 2026-09-24 (ver `Actualizaciones.md`)

## Resumen de controles

| Control | Qué hace | Dónde |
|---|---|---|
| SEC-05 Cifrado de campos | Cédula, teléfono, datos de salud del paciente, motivo de consulta y **todo el contenido de las notas clínicas** se guardan con AES-256-GCM (IV aleatorio, AAD por campo, llavero versionado). Unicidad y búsqueda exacta por HMAC-SHA256 con clave separada. `ClinicalNote` no tiene columnas en claro (`clinicalDataEnc`). | `backend/src/crypto`, `backend/src/patients/patient-data.codec.ts`, `backend/src/clinical/clinical-note.codec.ts` |
| Consentimiento paciente → médico | `PatientDataGrant`: alcance (IDENTITY/CONTACT/HEALTH), vencimiento, revocación, versión del texto. Sin grant vigente el médico solo ve el código `GMM-XXXX`. Cada lectura se audita (`PATIENT_DATA_READ`). | `backend/src/patients/patients.service.ts` |
| Analítica sin rastreo | Solo con consentimiento de análisis del visitante; el servidor no guarda IP ni user-agent. | `frontend/src/lib/analytics.ts`, `backend/src/analytics` |
| SEC-04 Subidas | Tipo real por magic bytes, re-codificación de imágenes con sharp (sin EXIF/GPS ni datos anexados), PDF con contenido activo rechazados, **ClamAV obligatorio en producción** (la API no arranca sin `CLAMAV_HOST`) y que falla cerrado. | `backend/src/uploads`, `backend/src/config/env.validation.ts` |
| SEC-03 Autorización | Permisos por función (`VERIFY_PROFESSIONALS`, `VERIFY_PATIENT_IDENTITY`, `REVIEW_PAYMENTS`, `MANAGE_PLANS`, …); sin bypass universal de SUPERADMIN. | `backend/src/common/permissions.ts`, `backend/src/common/guards/roles.guard.ts` |
| Equipos de organizaciones | Pertenencia (`OrganizationMember`) independiente del rol global de la cuenta. Roles OWNER / ADMIN / EDITOR con matriz única: el editor solo cambia contenido; nombre, tipo y RIF solo el dueño; nadie invita por encima de su rol; siempre queda al menos un dueño. Altas por invitación de un solo uso (72 h, solo hash del token, atada al correo). | `backend/src/organizations/organization-roles.ts`, `organization-invitations.ts` |
| SEC-02 Sesiones | Reuso de refresh tokens detectado (revoca todas las sesiones); `tokenVersion` invalida al instante los access tokens tras cambio o restablecimiento de contraseña, "cerrar todas las sesiones" o reuso; el rol se lee de la base en cada petición. **MFA por correo obligatorio para ADMIN/SUPERADMIN en producción**: la API no arranca sin `ADMIN_MFA_ENABLED=true`, salvo excepción fechada (`ADMIN_MFA_WAIVER_UNTIL`) que `deploy.sh` rechaza al vencer. | `backend/src/auth`, `backend/src/config/env.validation.ts`, `scripts/deploy.sh` |
| Auditoría de accesos sensibles | Lecturas de datos del paciente, caso de identidad (`PATIENT_IDENTITY_DOCUMENT_VIEWED`), descarga de documentos profesionales (`PROFESSIONAL_DOCUMENT_DOWNLOADED`) y apertura de comprobantes de pago (`PAYMENT_RECEIPT_VIEWED`), sin guardar el contenido sensible en el registro. | `backend/src/patients`, `backend/src/documents`, `backend/src/payments` |
| Pago Móvil | Índice único parcial `Payment_reference_active_unique` (banco emisor + referencia, pagos no rechazados): dos reportes simultáneos con la misma referencia → uno se guarda, el otro recibe 409 y su comprobante se borra. | migración `20260924114150_production_hardening`, `backend/src/payments/payments.service.ts` |
| Imágenes de contenedor | Runtime sin npm/yarn/corepack ni dependencias de desarrollo; Trivy bloquea CVE críticas corregibles en `api` y `web`. | `backend/Dockerfile`, `frontend/Dockerfile`, `.github/workflows/security.yml` |
| Legal versionado | Versión de Términos/Privacidad aceptada por usuario; re-aceptación obligatoria al cambiar la versión. | `backend/src/common/legal-versions.ts`, `frontend/src/lib/legal.ts` |

## Custodia de claves (LEER ANTES DE TOCAR `.env.prod`)

Las claves `DATA_ENCRYPTION_KEYS` y `DATA_LOOKUP_KEY` viven solo en el entorno del contenedor `api` (archivo `.env.prod` del VPS), nunca en PostgreSQL, en Git ni en los respaldos.

- **Si se pierden, los datos cifrados de pacientes son irrecuperables.** Guardar una copia en un gestor de contraseñas o bóveda fuera del VPS, separada de los respaldos de la base de datos y de la frase de cifrado de esos respaldos.
- Un respaldo de la base de datos sin las claves no permite leer cédulas, teléfonos, datos de salud ni notas clínicas: por eso no deben guardarse juntos. `scripts/restore-test.sh` comprueba cada semana que un respaldo restaurado se descifra con las claves reales y **no** con claves al azar.

### Rotación de la clave de cifrado

1. Respaldo previo (`scripts/backup.sh --label pre-rotacion`) y copia de `.env.prod` fuera del VPS.
2. Generar una clave nueva: `echo "v2:$(openssl rand -base64 32)"`.
3. Agregarla al llavero **sin quitar la anterior**: `DATA_ENCRYPTION_KEYS=v1:...,v2:...` y `DATA_ENCRYPTION_ACTIVE_KEY=v2`. Recrear `api`: todo lo nuevo se cifra con `v2`; lo antiguo sigue legible con `v1`.
4. Simular y luego re-cifrar lo antiguo, con la aplicación en marcha (cada escritura exige que el valor no haya cambiado desde que se leyó):
   ```bash
   docker compose ... exec api node dist/src/scripts/rotate-encryption-keys.js          # cuenta, no escribe
   docker compose ... exec api node dist/src/scripts/rotate-encryption-keys.js --apply  # re-cifra
   ```
   El script recorre todos los campos de `ENCRYPTED_FIELDS` (`backend/src/crypto/key-rotation.ts`), solo imprime conteos y termina con error si algún valor no se puede descifrar.
5. Repetir la simulación hasta que `stale` sea 0 en todos los campos, hacer un respaldo, ejecutar `scripts/restore-test.sh` y **solo entonces** retirar `v1` del llavero.

Nunca retirar una clave mientras un solo valor dependa de ella. `DATA_LOOKUP_KEY` no se rota sin recalcular todos los `cedulaLookup`/`phoneLookup` (cambiarla rompe la unicidad y la búsqueda exacta).

## Límites conocidos

- La detección de contenido activo en PDF no descomprime flujos de objetos; se compensa sirviendo siempre los documentos como descarga y con ClamAV.
- ClamAV usa ~1 GB de RAM (tope 2 GB, recarga de firmas no concurrente). Si clamd no responde, las subidas se rechazan con un mensaje hasta que vuelva.
- El segundo factor por correo necesita SMTP real: mientras producción use el Mailpit interno rige la excepción fechada de `ADMIN_MFA_WAIVER_UNTIL`.
- Nombre y apellido del paciente no se cifran (se usan en saludos de correo); no se muestran al médico sin grant `IDENTITY`.
- La historia clínica (`ClinicalNote`) sigue **sin endpoints ni UI** (un test lo verifica); habilitarla exige consentimiento con alcance HEALTH, auditoría de cada lectura y pasar por `ClinicalNoteCodec`. `FinanceRecord` también sigue sin endpoints.
