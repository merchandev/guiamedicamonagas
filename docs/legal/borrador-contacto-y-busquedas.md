# Borrador para revisión legal: «Quiero que me contacte» y apariciones en búsquedas

> **Estado: BORRADOR para la próxima versión de los textos.** Las dos funciones ya están en producción (ACT-0045) porque
> encajan en lo que hoy dicen la Política de privacidad («mensajes enviados a un profesional por el formulario de su
> perfil» y «estadísticas de uso… solo si aceptas la analítica») y la Política de cookies, que ya se actualizó (versión
> 1.2) para nombrar las apariciones en búsquedas. Estos párrafos las describen con detalle y conviene sumarlos en la
> misma subida de versión que las valoraciones (ver [`borrador-valoraciones.md`](borrador-valoraciones.md)).

## 1. Política de privacidad: «Pedidos de contacto»

**Qué es.** Un paciente con sesión puede pedirle a un médico, desde su ficha, que lo contacte. Elige qué compartir: su
nombre, un teléfono (para llamada o WhatsApp), el correo de su cuenta, un horario preferido y un mensaje. Antes de enviarlo
acepta un texto versionado (`CONTACT_REQUEST_CONSENT_VERSION`, hoy 1.0).

**Quién lo ve.** Solo ese médico, dentro del pedido, y la indicación de si la identidad del paciente está verificada. El
aviso y el correo que recibe el médico no llevan los datos del paciente.

**Cuánto dura.** El médico ve los datos durante 30 días o hasta que el paciente retira el pedido, lo que ocurra primero.
Después se borran del pedido (nombre, teléfono, correo, horario y mensaje) y solo queda el registro de que existió, con su
fecha y su estado. Si el paciente elimina su cuenta, también se borran.

**Para qué.** Solo para responder ese pedido. Cada pedido, su retiro y sus cambios de estado quedan en la auditoría.

**Límites.** Un pedido abierto por médico y como máximo cinco nuevos por día; hace falta el correo verificado y que el
médico reciba mensajes por su plan.

## 2. Política de privacidad: «Apariciones en búsquedas»

Con la analítica aceptada, se cuenta cuántas veces apareció cada perfil en los resultados del directorio y de las páginas
de especialidad, por día y por la especialidad y el municipio filtrados (solo valores de las listas del sitio). No se
guarda lo que la persona escribe en el buscador, ni quién buscó, ni su IP o navegador. El médico ve esos números como
totales en sus estadísticas, desde el plan Profesional.

## 3. Condiciones para profesionales: «Pedidos de contacto»

Agregar: «Los datos de un pedido de contacto solo se pueden usar para responder ese pedido. No se pueden guardar fuera de
la plataforma para otros fines, ni usar para publicidad, mercadeo o prospección comercial. Las apariciones en búsquedas
son totales anónimos: la plataforma no informa quién buscó a un profesional».

## 4. Política de retención

Agregar fila:

| Dato | Plazo |
|---|---|
| Datos compartidos en un pedido de contacto | 30 días o hasta que el paciente lo retire; queda el registro del pedido sin esos datos |
| Apariciones en búsquedas | Conteos diarios sin datos personales; **[A DEFINIR]** si se borran después de un tiempo |

## 5. Texto que acepta el paciente (versión 1.0, ya en el código)

En `frontend/src/lib/legal.ts` (`contactRequestConsent`):

> Autorizo a Dr(a). [nombre del médico] a ver los datos que elegí compartir, solo para responder este pedido. El pedido y
> esos datos se borran a los 30 días y puedo retirarlo antes desde «Pedidos de contacto».
