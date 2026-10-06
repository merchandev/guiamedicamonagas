# Borrador para revisión legal: récipes digitales

> **Estado: BORRADOR, no publicado.** Los récipes digitales están **apagados en producción**
> (`PRESCRIPTIONS_ENABLED=false`). Este documento describe lo que el sistema ya hace (verificado en el código de
> ACT-0046) para que un abogado venezolano lo revise antes de encenderlos. No inventa plazos: lo que falta decidir
> está marcado **[A DEFINIR]**. Conviene publicarlo en la misma subida de versión que los borradores de
> [valoraciones](borrador-valoraciones.md) y de [contacto y búsquedas](borrador-contacto-y-busquedas.md).

## Base normativa consultada

| Norma | Qué dice (resumen) | Cómo lo aplica el sistema |
|---|---|---|
| Ley de Medicamentos (G.O. N° 37.006 del 3 de agosto de 2000), art. 35 | Solo prescriben médicos, odontólogos y médicos veterinarios habilitados y registrados ante el Ministerio | Solo emite un médico con el **100 % de sus documentos aprobados** (título, registro MPPS, Colegio, artículo 8, cédula, RIF y, si es especialista, sus credenciales) y con su N° MPPS y su cédula en el perfil |
| Ley de Medicamentos, art. 36 | La prescripción identifica al prescriptor y al paciente, con indicaciones claras y legibles | Membrete con los datos del médico; datos del paciente obligatorios; texto impreso (no manuscrito) |
| Ley de Medicamentos, art. 37 | Clasifica los medicamentos según el tipo de receta (permiso especial del Ministerio, receta retenida con libro de control, receta que se repite, venta libre) | El médico acepta no emitir aquí estupefacientes, psicotrópicos ni otros que exijan récipe especial u oficial; el formulario lo recuerda |
| Ley de Medicamentos, art. 40 | El prescriptor puede marcar un medicamento como «insustituible» | Casilla «Insustituible» por medicamento; se imprime «(INSUSTITUIBLE)» |
| Resolución N° 028 del MPPS (G.O. N° 40.131, 2013), reformada por la Resolución N° 031 (G.O. N° 40.136 del 26 de marzo de 2013), art. 4 | Prescripción por principio activo o DCI, con concentración, forma farmacéutica, vía y dosis | Campos obligatorios por medicamento: principio activo (DCI), concentración, forma, vía, dosis y duración |
| Misma resolución, art. 5 | El récipe es un documento legal de dos partes (cuerpo para el farmacéutico e indicaciones al paciente); el cuerpo se emite por duplicado: el original queda en la farmacia y la copia vuelve sellada al paciente | El PDF es una hoja carta horizontal partida en dos medias cartas (récipe a la izquierda, indicaciones a la derecha) y trae **dos páginas: original y copia**, rotuladas así |
| Misma resolución, art. 6 | Datos obligatorios: médico (nombre, apellido, cédula, N° de registro en el Ministerio y firma); establecimiento (nombre, dirección y RIF, impresos y sellados); paciente (nombre, apellidos, cédula y año de nacimiento); DCI, concentración, forma, vía, dosis por toma y duración; lugar, fecha de emisión y de expiración, firma y sello; advertencias al farmacéutico; instrucciones al paciente; opcional, dos o más marcas equivalentes entre paréntesis. Prohíbe nombres, logos o lemas publicitarios de laboratorios, medicamentos o marcas comerciales | Todos esos datos son obligatorios en la API, salvo los que la norma deja opcionales. El logo es opcional y el médico acepta que sea el de su consultorio o centro de salud. **El récipe no lleva la marca de la plataforma**: solo la dirección para verificarlo |
| Misma resolución, art. 7 | Sin todos los datos del art. 6, el récipe no vale para dispensar | La API rechaza un récipe incompleto antes de numerarlo |
| Decreto con Fuerza de Ley N° 1.204 sobre Mensajes de Datos y Firmas Electrónicas (10 de febrero de 2001), arts. 16 a 18 | La firma electrónica tiene el valor de la autógrafa si cumple tres requisitos (datos de creación únicos y confidenciales, seguridad contra la falsificación e integridad del mensaje); la certificada por un proveedor acreditado se presume que los cumple; la que no los cumple vale como elemento de convicción según la sana crítica | **La firma del récipe es una imagen de la firma y del sello del médico, no una firma electrónica certificada.** El sistema suma: emisión solo desde la cuenta del médico, registro de auditoría, contenido que no se puede modificar, huella del contenido y verificación pública con el código. Ver la pregunta 1 |

## Qué hace el sistema

**Talonario.** El médico carga el nombre, la dirección, el RIF y el teléfono del establecimiento, el lugar de emisión
y la vigencia que se propone por defecto; sube su firma, su sello y, si quiere, el logo de su consultorio. La firma y
el sello se fotografían sobre papel blanco: el sistema vuelve transparente el fondo claro y rechaza una imagen sin
trazos. Las imágenes se guardan en almacenamiento privado. Antes de emitir acepta las condiciones del récipe digital
(versión 1.0, guardada con la fecha).

**Emisión.** Cada récipe recibe un número correlativo del médico y un **código de verificación** de 12 caracteres
(aleatorio). Su contenido completo (médico, establecimiento, paciente, medicamentos e indicaciones) se guarda
**cifrado**; el código, cifrado y con un hash para buscarlo. Un récipe emitido **no se edita**: la base de datos
impide cambiar su número, código, huella, médico y fechas. Si tiene un error, el médico lo **anula** con un motivo y
emite otro. La vigencia la elige el médico (de 1 a 365 días) y vence al final de ese día, hora de Caracas.

**Cómo llega al paciente.**
- *Dentro de la plataforma*: a un paciente con cuenta del directorio del médico (con citas o registrado con su código,
  sin acceso revocado). El paciente recibe un aviso que no nombra medicamentos.
- *Con el código*: el paciente lo agrega a «Mis récipes» solo si la cédula impresa (la suya o la del representante de
  un menor) es la de su cuenta.
- *PDF*: el médico y el paciente lo descargan; también quien tenga el código.
- *WhatsApp*: el botón abre WhatsApp con un mensaje que lleva el enlace y el código; la plataforma no envía el mensaje.
- *Correo*: el médico lo envía con el PDF adjunto al correo que indique (máximo 5 envíos por récipe). La auditoría
  guarda el envío con el correo enmascarado.

**Verificación.** Quien tenga el código o escanee el QR (el paciente o la farmacia) ve en `/recipe` el récipe tal como
se emitió, si está vigente, vencido o anulado, y si su huella coincide. El código va después de «#» en el enlace: no
llega al servidor ni a la vista previa que arma WhatsApp. La página no aparece en buscadores. El motivo de una
anulación solo lo ven el médico y el paciente.

**Eliminación de cuentas.** Si se elimina la cuenta del médico, se borran sus récipes, su talonario y sus imágenes. Si
se elimina la de un paciente, los récipes se quitan de su cuenta y quedan solo en el registro del médico que los
emitió.

## Decisiones pendientes del titular y del abogado

| Tema | Hoy en el sistema | Qué hay que decidir |
|---|---|---|
| 1. Valor de la firma | Imagen de la firma y del sello, más los controles de arriba | Si basta para que la farmacia lo acepte impreso o en pantalla, o si conviene integrar una firma electrónica certificada por un proveedor acreditado ante SUSCERTE |
| 2. Duplicado | El PDF trae original y copia; el paciente imprime las dos páginas | Si así se cumple el art. 5 para un récipe emitido en línea |
| 3. Fecha de expiración | La elige el médico (1 a 365 días; se propone 30) | Si hay un plazo máximo que deba imponerse |
| 4. Medicamentos de control especial | El médico declara que no los emite aquí; no hay una lista que los bloquee | Si basta la declaración o hace falta bloquear una lista oficial |
| 5. Odontólogos | Solo médicos (la verificación de la plataforma es de médicos) | Si se abre a odontólogos, que la resolución también incluye |
| 6. Retención | Los récipes y sus imágenes no se borran solos | **[A DEFINIR]** cuánto tiempo se guardan y qué pasa al vencer el plazo |
| 7. Dirección de verificación al pie | «Verifíquelo en guiamedicamonagas.com/recipe» | Si la prohibición de nombres o marcas comerciales del art. 6 alcanza a esa línea |
| 8. Responsable del tratamiento | `DATA_CONTROLLER` sin publicar | Publicarlo junto con estos textos |

---

## 1. Política de privacidad: sección nueva «Récipes digitales»

**Quién los crea.** Solo los médicos verificados de la plataforma, desde su panel. El médico decide su contenido y
responde por él; Guía Médica Monagas no prescribe ni dispensa medicamentos.

**Qué datos lleva un récipe.** Los que exige la norma sanitaria: del médico (nombre, cédula, N° MPPS, N° del Colegio y
especialidades), del establecimiento (nombre, dirección, RIF y teléfono), del paciente (nombre, cédula o la de su
representante si es un menor, y año de nacimiento) y de los medicamentos (principio activo, concentración, forma, vía,
dosis, duración, cantidad, marcas equivalentes e indicaciones), además del lugar y las fechas de emisión y de
vencimiento. Son datos de salud.

**Para qué.** Para que el paciente lo vea y lo descargue, y para que quien tenga su código compruebe que es auténtico y
está vigente. No se usan para publicidad, ni para estudiar hábitos de consumo de medicamentos, ni se entregan a
farmacias, laboratorios o aseguradoras.

**Quién lo ve.** El médico que lo emitió; el paciente, si lo tiene en su cuenta; y quien tenga el código de
verificación (por ejemplo, la farmacia a la que el paciente lo lleva). El código va impreso en el récipe y en su QR:
el paciente decide a quién se lo muestra.

**Cómo se protege.** Se guarda cifrado; las imágenes de la firma y del sello, en almacenamiento privado. Cada emisión,
anulación, envío por correo, entrega y alta con código queda en la auditoría.

**Cuánto tiempo.** **[A DEFINIR]**. Al eliminar la cuenta del médico se borran sus récipes; al eliminar la del
paciente, se quitan de su cuenta y quedan en el registro del médico.

## 2. Condiciones para profesionales: sección nueva «Récipes digitales»

El médico acepta, antes de emitir (texto que ya muestra el talonario, versión 1.0 en
`frontend/src/lib/legal.ts`, `PRESCRIPTION_RULES`):

> - Soy responsable del contenido de cada récipe que emito: el paciente, los medicamentos, las dosis y las indicaciones.
> - No emito aquí estupefacientes, psicotrópicos ni otros medicamentos que exijan un récipe especial u oficial: esos van
>   en el formato que pide la autoridad sanitaria.
> - La firma y el sello que subo son míos, y el logo es de mi consultorio o del centro donde atiendo, nunca de
>   laboratorios, medicamentos ni marcas comerciales.
> - Mi cuenta es personal: no dejo que otra persona emita récipes con mi firma y mi sello.
> - Si un récipe tiene un error, lo anulo y emito otro: un récipe emitido no se edita.
> - Guía Médica Monagas guarda una copia de cada récipe para que el paciente la vea y lo descargue, y para que la
>   farmacia compruebe con su código que es auténtico y está vigente.

Agregar: «La plataforma no revisa el contenido clínico de los récipes. Un récipe solo se emite si el perfil del médico
está verificado y su talonario está completo; si la verificación se pierde (por ejemplo, al cambiar su N° MPPS), no
puede emitir hasta que se revise de nuevo. Los récipes ya emitidos no cambian».

## 3. Términos y condiciones y Descargo médico

Hoy dicen que la plataforma no ofrece «prescripciones, recetas o indicaciones de tratamiento». Sigue siendo cierto:
proponer aclararlo así: «Guía Médica Monagas no prescribe. Ofrece a los médicos verificados una herramienta para emitir
y compartir sus propios récipes; el contenido de cada récipe es responsabilidad del médico que lo firma».

## 4. Política de retención

| Dato | Plazo |
|---|---|
| Récipes emitidos (contenido cifrado, número, código, fechas y estado) | **[A DEFINIR]** |
| Imágenes de firma, sello y logo | Mientras el médico las use en su talonario o en algún récipe guardado; **[A DEFINIR]** después |
| Registro de auditoría de récipes (emisión, anulación, envíos) | **[A DEFINIR]** |
