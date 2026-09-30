import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('consentimiento-paciente');

const SECTIONS: LegalSection[] = [
  {
    id: 'que-datos',
    title: 'Qué datos se almacenan',
    body: (
      <>
        <P>Autorizo a Guía Médica Monagas a almacenar y proteger los datos que yo decida registrar en mi perfil:</P>
        <Ul
          items={[
            'mis datos de identidad y contacto: nombre, apellido, cédula, teléfono, municipio, foto de perfil y foto de mi documento de identidad;',
            'mi información de salud: fecha de nacimiento, sexo, grupo sanguíneo, alergias, resumen de mi condición, medicamentos y horarios, médicos tratantes, y dirección y teléfono para emergencias;',
            'mis citas y el motivo de consulta que escriba;',
            'las autorizaciones que dé a los médicos y el historial de accesos a mis datos.',
          ]}
        />
        <P>Registrar información de salud es voluntario: puedo usar mi cuenta sin completar esos campos.</P>
      </>
    ),
  },
  {
    id: 'finalidad',
    title: 'Para qué se usan',
    body: (
      <P>
        Exclusivamente para operar y proteger las funciones de la plataforma que yo utilizo: mantener mi perfil privado,
        gestionar mis citas y permitir que los médicos que yo autorice vean los datos que yo elija. No se usan para fines
        incompatibles con estos.
      </P>
    ),
  },
  {
    id: 'proteccion',
    title: 'Privacidad y protección',
    body: (
      <Ul
        items={[
          'Mi perfil no es público ni aparece en buscadores.',
          'Mis datos sensibles se guardan cifrados y viajan por conexiones cifradas.',
          'El acceso está controlado y los accesos de los médicos quedan registrados.',
        ]}
      />
    ),
  },
  {
    id: 'quien',
    title: 'Quién puede verlos',
    body: (
      <>
        <Ul
          items={[
            'Yo, desde mi cuenta.',
            'Los médicos que yo autorice, con el alcance y por el tiempo que yo decida. Sin mi autorización, un médico solo ve mi código de paciente.',
            'El personal administrativo no tiene acceso a mi información de salud a través de la plataforma; puede verificar mi identidad con un acceso protegido y registrado.',
          ]}
        />
        <P>
          Las reglas completas están en la política de <DocLink to="datos-de-salud" />.
        </P>
      </>
    ),
  },
  {
    id: 'autorizacion',
    title: 'Cómo autorizo a un profesional',
    body: (
      <P>
        Desde mi panel (sección «Permisos»), al reservar una cita o entregando mi código o QR a un médico. Cada
        autorización tiene un alcance (nombre, contacto, salud), una fecha de vencimiento y queda registrada. El detalle
        está en la <DocLink to="autorizacion-medica" />.
      </P>
    ),
  },
  {
    id: 'revocacion',
    title: 'Revocación',
    body: (
      <P>
        Puedo revocar en cualquier momento, desde mi cuenta y con efecto inmediato, la autorización dada a un médico.
        También puedo generar un código nuevo, con lo que el anterior deja de funcionar.
      </P>
    ),
  },
  {
    id: 'no-usos',
    title: 'Lo que no se hace con mis datos',
    body: (
      <Ul
        items={[
          'No se venden, alquilan ni ceden.',
          'No se usan para publicidad ni para estudiar mis hábitos de consumo.',
          'No se usan para entrenar modelos de lenguaje ni de inteligencia artificial.',
          'No se comparten con farmacias, laboratorios, aseguradoras ni otros comercios.',
        ]}
      />
    ),
  },
  {
    id: 'no-servicio-medico',
    title: 'La plataforma no presta servicios médicos',
    body: (
      <P>
        Entiendo que Guía Médica Monagas es un directorio tecnológico: no me atiende, no me diagnostica, no me prescribe
        y no es un servicio de emergencias. Mi perfil es un resumen aportado por mí y no sustituye la historia clínica que
        lleva mi médico. Ver el <DocLink to="descargo-medico" />.
      </P>
    ),
  },
  {
    id: 'retencion',
    title: 'Conservación',
    body: (
      <P>
        Mis datos se conservan mientras mi cuenta esté activa. Puedo modificar o borrar mi información de salud editando
        mi perfil. Al cerrar mi cuenta se aplican las reglas de la política de <DocLink to="retencion" />.
      </P>
    ),
  },
  {
    id: 'derechos',
    title: 'Mis derechos',
    body: (
      <P>
        Puedo ver, corregir y descargar mis datos, consultar quién accedió a ellos, revocar autorizaciones y pedir el
        cierre de mi cuenta y la eliminación de mis datos, como se explica en el <DocLink to="derechos" />.
      </P>
    ),
  },
  {
    id: 'retiro',
    title: 'Retirar este consentimiento',
    body: (
      <P>
        Puedo retirar este consentimiento en cualquier momento pidiendo el cierre de mi cuenta por el{' '}
        <Link href="/reclamos?tipo=ACCOUNT_DELETION" className="text-pine-700 underline">
          canal de solicitudes
        </Link>
        . El retiro no afecta la validez de lo hecho mientras estuvo vigente.
      </P>
    ),
  },
  {
    id: 'evidencia',
    title: 'Evidencia de mi aceptación',
    body: (
      <>
        <P>Al marcar la casilla de aceptación, la plataforma guarda:</P>
        <Ul
          items={[
            'la cuenta que aceptó;',
            'el documento aceptado y su número de versión;',
            'la fecha y la hora;',
            'el contexto (registro de la cuenta o aceptación de una versión nueva);',
            'datos técnicos de la aceptación: dirección IP y navegador.',
          ]}
        />
        <P>
          Ese registro no puede modificarse ni borrarse; solo se anonimiza si la cuenta se elimina. Cada cambio sustancial
          de este texto genera una versión nueva, que la plataforma pide aceptar de nuevo.
        </P>
      </>
    ),
  },
];

export default function PatientConsentPage() {
  return (
    <LegalPage
      slug="consentimiento-paciente"
      lead={
        <>
          <p>
            Este es el texto que aceptas, con una casilla propia, al crear tu cuenta de paciente. Está escrito en primera
            persona porque es tu declaración.
          </p>
          <Callout title="Solo para mayores de edad">
            El registro de pacientes es para personas de 18 años o más. Ver <DocLink to="menores" />.
          </Callout>
        </>
      }
      sections={SECTIONS}
      related={['datos-de-salud', 'autorizacion-medica', 'privacidad', 'derechos', 'menores']}
    />
  );
}
