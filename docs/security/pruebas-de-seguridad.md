# Pruebas de seguridad

Estado: vigente desde el 2026-10-01 (ACT-0039). Qué se prueba solo, en cada cambio, y qué queda para una prueba de
penetración humana antes de cargar datos reales de pacientes.

## Capas automáticas

| Capa | Dónde | Qué cubre |
|---|---|---|
| Política de rutas | [`backend/test/unit/route-policy.spec.ts`](../../backend/test/unit/route-policy.spec.ts) (unitarias, cada push) | Lee los decoradores de **todas** las rutas de la API: solo las de una lista revisada responden sin sesión; toda ruta de administración exige un permiso concreto; ninguna usa `@Roles(ADMIN)`; las rutas «me» del médico exigen su rol. Una ruta pública nueva hace fallar la prueba hasta que se agrega a conciencia |
| Pruebas de la API | `backend/test/e2e/*.mjs` (CI) | Cifrado de datos de salud, consentimiento y revocación, código del paciente, permisos de administración, organizaciones, concurrencia de pagos, descargas auditadas |
| Pruebas del sitio | [`e2e/tests/seguridad.spec.ts`](../../e2e/tests/seguridad.spec.ts) y el resto de la suite (CI) | Acceso cruzado entre cuentas (IDOR/BOLA: médico ↔ paciente ajeno, paciente ↔ paciente), escalada de médico a administración, rutas privadas sin sesión (401), tokens con el rol cambiado o sin firma (401), freno a la fuerza bruta (429), XSS almacenado en el perfil (se muestra como texto), CSP y cabeceras, MFA del administrador por correo |
| Análisis estático y dependencias | Workflow «Seguridad» (cada push y cada lunes) | CodeQL, gitleaks, `npm audit` con política de HIGH, Trivy de imágenes y configuración |
| Escaneo pasivo | Workflow [«Seguridad dinámica (ZAP)»](../../.github/workflows/zap.yml) (día 1 de cada mes y a pedido) | OWASP ZAP *baseline* sobre el sitio publicado: solo GET; falla si vuelve a faltar una protección básica (anti-clickjacking, CSP, HSTS, `nosniff`, cookies `Secure`/`HttpOnly`/`SameSite`, `X-Powered-By`, errores expuestos) |

## Endurecimiento aplicado en ACT-0039

- **CSP** en todas las páginas: solo recursos del propio dominio, más el video de YouTube (sin cookies, al pulsar),
  sus miniaturas y el mapa de Google del consultorio; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`. `'unsafe-inline'` en scripts es necesario para las páginas estáticas e ISR de Next.js;
  quitarlo exigiría *nonces* y renderizar todo a pedido.
- Sin `X-Powered-By`; `X-Frame-Options: DENY`.

## Para la prueba de penetración humana (antes de cargar datos reales)

Hacerla contra un **entorno de pruebas**, nunca contra producción, con cuentas de prueba de cada rol. Alcance mínimo
y qué ya está cubierto por las pruebas automáticas (para que el tiempo se use en lo que no lo está):

| Tema | Automático hoy | Para el humano |
|---|---|---|
| IDOR/BOLA en citas, pacientes, documentos, pagos, organizaciones | Casos principales | Recorrer todos los identificadores de cada recurso y cada rol, incluidas organizaciones y sus miembros |
| Escalada de privilegios (médico → admin, editor → dueño de organización) | Médico → admin | Roles de organización, invitaciones, cambio de rol |
| Código y QR del paciente | Revocación y código ajeno | Enumeración y fuerza bruta de códigos, reutilización, tiempos |
| Sesión: fijación, robo, cierre en todos los dispositivos | Tokens falsificados | Fijación de sesión, cookie de renovación, `logout-all`, rotación |
| CSRF | — (API con token en cabecera y cookie `SameSite`) | Confirmar que ninguna acción cambia estado solo con la cookie |
| XSS almacenado y reflejado | Biografía del médico | Publicaciones, mensajes, nombres, campos de administración, parámetros de URL |
| Archivos maliciosos | ClamAV (EICAR), PDF con JavaScript, re-codificación de imágenes | Polyglots, archivos enormes, nombres con trucos |
| URLs firmadas de archivos | Descarga anónima negada | Caducidad, reutilización, acceso a claves ajenas |
| Límites de peticiones | Inicio de sesión | Registro, recuperación de contraseña, reclamos, código del paciente |
| Recuperación de contraseña y MFA | Flujo completo con correo | Enumeración de cuentas, reutilización de enlaces, saltar el segundo factor |
| Bóveda de pacientes | Abrir, vencer y cerrar | Fuerza bruta del código (bloqueo tras 5 fallos), acceso sin la cookie de la bóveda |

Un hallazgo alto o crítico explotable es NO-GO para operar con pacientes reales (ver
[`docs/operations/go-no-go.md`](../operations/go-no-go.md)).
