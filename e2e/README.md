# Pruebas de extremo a extremo (Playwright)

Recorren el sitio como lo usa una persona, contra una **API y una web reales** con su PostgreSQL. Cada prueba crea
sus propias cuentas (sufijo único), así que la suite puede repetirse sobre la misma base. En CI corren en el job
«Sitio · extremo a extremo» de [`ci.yml`](../.github/workflows/ci.yml) con Mailpit, S3Mock y MFA de administradores.

| Archivo | Qué prueba |
|---|---|
| `publico.spec.ts` | Portada, planes, directorio, especialidades, centro legal, reclamos, registro e inicio de sesión: cargan sin errores, sin desbordarse en el teléfono y sin fallas graves de accesibilidad (axe, WCAG 2 A/AA); cifras reales en el HTML; Marca Médica en `/planes`; URL canónica y tarjeta para compartir; `/version.json`; cabeceras de seguridad y CSP; pacientes fuera de buscadores |
| `cuentas.spec.ts` | Registro de paciente y de médico desde los formularios, salir y volver a entrar, contraseña equivocada; con Mailpit, verificación del correo y recuperación de la contraseña |
| `directorio.spec.ts` | Un médico publicado se encuentra por apellido, código GM y especialidad; su ficha muestra lo profesional y nada privado; página de la especialidad |
| `paciente.spec.ts` | Reserva de una cita en línea que el médico recibe; código del paciente → el médico lo registra → el paciente revoca → el médico pierde el acceso |
| `reclamos.spec.ts` | Reclamo sin cuenta, número de seguimiento y consulta del estado (con otro correo no se revela nada) |
| `admin.spec.ts` | Inicio de sesión del administrador (con código por correo si el MFA está activo y aceptando los textos legales nuevos), aprobar el último documento publica al médico con su sello, suspender y eliminar definitivamente una cuenta |
| `pagos.spec.ts` | La administración registra el Pago Móvil, el médico elige un plan y lo ve en su panel, reporta el pago con comprobante (necesita almacenamiento) y la administración lo aprueba |
| `seguridad.spec.ts` | Acceso cruzado entre cuentas (IDOR/BOLA), escalada de médico a administración, rutas privadas sin sesión, tokens falsificados, freno a la fuerza bruta y XSS almacenado en el perfil |

Los proyectos son `escritorio` (Chrome) y `movil` (Pixel 7, para lo público y las cuentas). Con
`E2E_TODOS_LOS_NAVEGADORES=1` se suman Firefox y Safari en iPhone para lo público.

## Correrlas en local

1. API en marcha (`NODE_ENV=test`) con su base de datos y la web (`npm run dev` o la compilación de producción).
   **La web y la API deben usar el mismo host** (`localhost` o `127.0.0.1`, no uno de cada uno): la sesión vive en una
   cookie de ese host.
2. En `e2e/`: `npm ci`. Sin descargar navegadores, con el Edge o el Chrome del equipo:

```bash
E2E_CHANNEL=msedge E2E_API_URL=http://localhost:4000/api/v1 E2E_WEB_URL=http://localhost:3000 \
  DATABASE_URL=postgresql://... SEED_SUPERADMIN_PASSWORD=... npx playwright test
```

| Variable | Para qué |
|---|---|
| `E2E_WEB_URL`, `E2E_API_URL` | Dónde están la web y la API (por defecto `localhost:3000` y `localhost:4000`) |
| `DATABASE_URL` | La base de la API: los datos de prueba que tardarían días (documentos aprobados) se cargan directo |
| `SEED_SUPERADMIN_PASSWORD` (y `SEED_SUPERADMIN_EMAIL`) | El administrador de la semilla, para las pruebas de administración |
| `E2E_MAILPIT_URL` | Mailpit (p. ej. `http://localhost:8025`): sin él se omiten las pruebas que leen correos |
| `E2E_STORAGE=1` | Hay almacenamiento S3: fotos reales y comprobantes de pago |
| `E2E_EXPECT_ADMIN_MFA=1` | Exige que el inicio de sesión del administrador pida el código por correo |

Las pruebas nunca usan producción: crean cuentas, documentos y pagos de prueba.
