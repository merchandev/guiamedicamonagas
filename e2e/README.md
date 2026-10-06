# Pruebas de extremo a extremo (Playwright)

Recorren el sitio como lo usa una persona, contra una **API y una web reales** con su PostgreSQL. Cada prueba crea
sus propias cuentas (sufijo único), así que la suite puede repetirse sobre la misma base. En CI corren en el job
«Sitio · extremo a extremo» de [`ci.yml`](../.github/workflows/ci.yml) con Mailpit, S3Mock y MFA de administradores.

| Archivo | Qué prueba |
|---|---|
| `publico.spec.ts` | Portada, planes, directorio, especialidades, centro legal, reclamos, registro e inicio de sesión: cargan sin errores, sin desbordarse en el teléfono y sin fallas graves de accesibilidad (axe, WCAG 2 A/AA); cifras reales en el HTML; Marca Médica en `/planes`; URL canónica y tarjeta para compartir; `/version.json`; cabeceras de seguridad y CSP; pacientes fuera de buscadores |
| `cuentas.spec.ts` | Registro de paciente y de médico desde los formularios, salir y volver a entrar, contraseña equivocada; con Mailpit, verificación del correo y recuperación de la contraseña |
| `contacto.spec.ts` | «Quiero que me contacte»: el paciente elige qué compartir desde la ficha, el médico lo ve solo en el pedido (el aviso no lleva los datos), lo marca como contactado y el paciente lo retira (sus datos se borran); reglas (correo verificado, plan que recibe mensajes, uno abierto por médico, datos coherentes, 30 días). Apariciones en búsquedas solo con la analítica aceptada, sin el texto buscado, y en las estadísticas del médico |
| `directorio.spec.ts` | Un médico publicado se encuentra por apellido, código GM y especialidad; su ficha muestra lo profesional y nada privado; página de la especialidad |
| `paciente.spec.ts` | Reserva de una cita en línea que el médico recibe (su aviso dice la misma hora, en hora de Caracas); código del paciente → el médico lo registra → el paciente revoca → el médico pierde el acceso |
| `agenda.spec.ts` | Calendario del médico: arrastrar una cita la mueve (con confirmación) y queda en su historial; «Mover» sin arrastrar; citas fuera de horario solo del médico y nunca solapadas; antelación mínima y días hacia adelante de las reservas; tramos bloqueados; horario semanal con formulario; el paciente reprograma desde «Mis citas»; historial con nombre solo con permiso (auditado), filtros y totales; accesibilidad del calendario |
| `moderacion.spec.ts` | Moderación de valoraciones (solo con el permiso): aprobar, rechazar con motivo, retirar guardando la evidencia, restaurar y eliminar con «ELIMINAR», y el autor recibe cada decisión; respuestas y denuncias de los médicos; sanciones por días (sin opiniones o con la cuenta suspendida) que no tocan citas ni autorizaciones, se explican al iniciar sesión y vencen solas; la identidad del autor solo con la bóveda; pantalla de moderación con axe; categoría de reclamos «Valoración abusiva o falsa» |
| `notificaciones.spec.ts` | La campana avisa al médico de una cita nueva y lo lleva a sus citas; página «Notificaciones» y «marcar todas como leídas»; el paciente apaga los recordatorios por correo; la administración recibe cada reclamo; nadie ve ni marca avisos ajenos |
| `valoraciones.spec.ts` | Valoraciones de pacientes: solo con registro completo, cédula aprobada y consulta verificada (cita realizada y pasada, o registro con el código); una por médico y máximo tres por día; sin comentario se publica al instante y con comentario espera moderación (el filtro marca teléfonos); promedio desde la tercera; autor anónimo por defecto y nada que lo identifique; el médico responde (en revisión) y denuncia, y nunca ve al autor anónimo; accesibilidad de la sección en la ficha |
| `recipes.spec.ts` | Récipes digitales: el médico verificado emite desde su panel para un paciente de su directorio, el paciente lo ve en «Mis récipes» (aviso sin medicamentos, accesibilidad), la farmacia lo verifica sin sesión con el enlace del QR y el médico lo anula; reglas (solo verificados con talonario, datos del art. 6, menor con representante, máximo 8 medicamentos y que quepa en media hoja, correlativo, vencimiento al final del día, contenido cifrado, no se edita, agregar con el código solo con la cédula impresa). Con almacenamiento (CI): firma con fondo transparente, PDF del médico, por código y de muestra; con Mailpit: envío por correo con el PDF |
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
