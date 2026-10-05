# Borrador para revisión legal: valoraciones, respuestas, moderación y sanciones

> **Estado: BORRADOR, no publicado.** Las valoraciones están **apagadas en producción** (`REVIEWS_ENABLED=false`).
> Este texto describe lo que el sistema ya hace (verificado en el código de ACT-0043 y ACT-0044) para que un abogado
> venezolano lo revise antes de encenderlas. No inventa plazos: lo que falta decidir está marcado **[A DEFINIR]**.

## Cómo se publica (cuando el abogado lo apruebe)

1. El titular publica sus datos como responsable del tratamiento (`DATA_CONTROLLER` en `frontend/src/lib/legal.ts`).
2. Se incorporan estos textos a las páginas y se sube **una sola vez** la versión de los documentos afectados en
   `frontend/src/lib/legal.ts` y `backend/src/common/legal-versions.ts` (Términos, Privacidad y Condiciones para
   profesionales). Así cada usuario acepta los cambios una sola vez.
3. Se fija el plazo de evidencia (`REVIEW_EVIDENCE_RETENTION_DAYS`) y se declara en la política de retención.
4. Se enciende `REVIEWS_ENABLED=true` en `.env.prod` y se despliega.

## Decisiones pendientes del titular y del abogado

| Tema | Hoy en el sistema | Qué hay que decidir |
|---|---|---|
| Evidencia de valoraciones y respuestas rechazadas o retiradas | Se guardan sin publicar y no se borran (variable vacía) | **[A DEFINIR]** plazo en días (30 a 3650) |
| Riesgo de difamación | Moderación previa de todo comentario y respuesta, retiro inmediato, canal de reclamos | Si el texto de las reglas y de los términos basta, o hace falta algo más |
| Autor con nombre e inicial | Opcional; por defecto «Paciente verificado» | Si se mantiene la opción de mostrar «María G.» |
| Sanción indefinida de opiniones | Permitida (la de la cuenta siempre es por días) | Si se mantiene |

---

## 1. Términos y condiciones: sección nueva «Valoraciones de pacientes»

**Quién puede valorar.** Solo una cuenta de paciente que cumpla todo lo siguiente, comprobado por la plataforma:

- correo verificado y mayoría de edad declarada al registrarse;
- registro completo: nombre y apellido, cédula, teléfono, municipio, foto de perfil y foto de la cédula (no se piden
  datos de salud para opinar);
- cédula aprobada por el equipo de verificación;
- una consulta verificada con ese médico: una cita realizada y ya pasada en la plataforma, o que el médico lo haya
  registrado con el código del paciente;
- no tener una sanción vigente que se lo impida.

**Cómo se valora.** De 1 a 5 estrellas y un comentario opcional de hasta 1000 caracteres. Una valoración por paciente y
médico, que el autor puede editar o borrar; como máximo tres valoraciones nuevas por día. Antes de enviarla, el paciente
acepta las reglas de las valoraciones (sección 7), cuya versión queda guardada con la valoración.

**Qué no se permite.** Datos de salud propios o de otras personas, teléfonos, correos, enlaces o números de cédula,
insultos y acusaciones que no se puedan sostener, y valoraciones sobre algo distinto de la atención recibida.

**Moderación.** Las valoraciones sin comentario se publican al enviarlas. Todo comentario, y toda respuesta de un médico,
lo revisa el equipo antes de publicarlo. Un filtro automático señala al equipo los textos con teléfonos, correos,
enlaces, cédulas, insultos o términos de salud; no publica ni rechaza nada por sí solo.

**Decisiones del equipo.** El equipo puede:

- rechazar una valoración o una respuesta en revisión, con un motivo que recibe el autor, quien puede corregirla;
- retirar una publicada: deja de mostrarse y de contar para el promedio, y se guarda sin publicar como evidencia por
  **[A DEFINIR]**;
- restaurarla si la retiró o rechazó por error;
- eliminarla para siempre cuando su contenido lo exige (por ejemplo, datos de salud de otra persona);
- retirar todas las valoraciones de un mismo autor.

Cada decisión se comunica al afectado con el motivo y queda registrada.

**Sanciones.** Por lo escrito en valoraciones o respuestas, el equipo puede aplicar, por los días que decida (de 1 a
365):

- una suspensión de opiniones: no puede escribir ni editar valoraciones ni respuestas; el resto de la cuenta sigue
  igual. También puede ser indefinida;
- una suspensión de la cuenta: no puede iniciar sesión hasta la fecha indicada. Sus citas y las autorizaciones que dio a
  sus médicos se mantienen.

El titular recibe el motivo, la fecha de fin y cómo reclamar. La sanción termina sola en esa fecha; el equipo puede
levantarla antes o cambiar su duración. La suspensión indefinida de una cuenta sigue las reglas generales de
suspensión de estos términos.

**Reclamos.** Cualquier persona puede denunciar una valoración, y cualquier autor o médico puede reclamar por una
decisión o una sanción, en «Reclamos y solicitudes» (categoría «Valoración abusiva o falsa»).

**Naturaleza.** Las valoraciones son opiniones de pacientes, no una recomendación de Guía Médica Monagas, y no cambian el
orden del directorio.

## 2. Política de privacidad: sección nueva «Valoraciones»

**Qué se publica.** Las estrellas, el comentario, «Paciente verificado» (o el nombre y la inicial del apellido, si el
autor lo elige), el tipo de consulta verificada (cita en la plataforma o registro por el médico) con el mes y el año, y
la respuesta del médico. **No se publican** la cédula, el código del paciente, su foto ni la fecha exacta de la consulta.

**Quién ve qué.** El médico ve lo mismo que el público y nunca quién escribió una valoración anónima. El equipo de
moderación ve el texto y, solo con el código de seguridad de los registros de pacientes, quién la escribió; cada una de
esas consultas queda registrada.

**Qué datos se usan para comprobar los requisitos.** El correo verificado, la declaración de mayoría de edad, que el
registro esté completo (sin leer los datos de salud), la aprobación de la cédula y las citas realizadas o el registro
por código con ese médico.

**Base.** El paciente decide publicar y acepta las reglas al enviarla; puede editarla o borrarla cuando quiera, salvo
una valoración retirada, que se conserva como evidencia.

**Conservación.** Las valoraciones publicadas se conservan mientras exista la cuenta del autor; al eliminarla se borran.
Las rechazadas o retiradas se conservan como evidencia por **[A DEFINIR]** y luego se borran.

## 3. Condiciones para profesionales: sección nueva «Valoraciones»

- No puedes borrar ni ocultar valoraciones; ningún plan cambia eso.
- No puedes comprar, intercambiar ni pedir valoraciones a cambio de descuentos o beneficios.
- Puedes responder una vez a cada valoración. La respuesta es pública y la revisa el equipo antes de publicarla. Por el
  secreto médico, no puede revelar nada clínico del paciente ni datos que permitan identificarlo.
- Puedes denunciar una valoración (no fue tu paciente, contiene datos de salud, es ofensiva, es falsa u otro motivo).
  Mientras el equipo la revisa, sigue publicada.
- Por lo escrito en tus respuestas se pueden aplicar las sanciones de los Términos (suspensión de respuestas o de la
  cuenta).

## 4. Política de publicidad médica

Agregar: «Las valoraciones de pacientes no son una recomendación de la plataforma. El orden del directorio no depende de
ellas y no se envían a los buscadores como datos estructurados».

## 5. Política de retención

Agregar filas:

| Dato | Plazo |
|---|---|
| Valoraciones y respuestas rechazadas o retiradas (evidencia) | **[A DEFINIR]** |
| Avisos ya leídos de la campana | **[A DEFINIR]** (`NOTIFICATION_RETENTION_DAYS`, ver ACT-0041) |

## 6. Versionado

Una sola subida de versión junto con la publicación de `DATA_CONTROLLER`: Términos, Privacidad y Condiciones para
profesionales. Las reglas de las valoraciones tienen su propia versión (`REVIEW_RULES_VERSION`, hoy 1.0), que se guarda
en cada valoración.

## 7. Reglas que acepta el paciente al enviar una valoración (versión 1.0, ya en el código)

Texto vigente en `frontend/src/lib/legal.ts` (`REVIEW_RULES`):

1. Es tu opinión sobre la atención que recibiste: el trato, la puntualidad, la claridad de las explicaciones y el lugar
   de consulta.
2. No incluyas datos de salud tuyos ni de otras personas (diagnósticos, tratamientos o medicamentos), ni teléfonos,
   correos, enlaces o números de cédula.
3. Sin insultos ni acusaciones que no puedas sostener.
4. Si solo eliges las estrellas, tu valoración se publica al enviarla. Si escribes un comentario, el equipo de Guía Médica
   Monagas lo revisa antes de publicarlo y puede rechazarlo si incumple estas reglas.
5. Se publica como «Paciente verificado», salvo que elijas mostrar tu nombre y la inicial de tu apellido. Nunca se
   muestran tu cédula, tu código, tu foto ni la fecha exacta de tu consulta: solo el mes y el año.
