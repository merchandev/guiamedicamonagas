import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';
import { EMERGENCY_NOTICE, NOT_PROVIDED_SERVICES } from '@/lib/legal';

export const metadata = legalMetadata('terminos');

const SECTIONS: LegalSection[] = [
  {
    id: 'naturaleza',
    title: 'Naturaleza del servicio',
    body: (
      <>
        <P>
          Guía Médica Monagas es una <strong>plataforma tecnológica de directorio y conexión</strong>. Permite encontrar,
          identificar y contactar a profesionales médicos independientes; ofrece a esos profesionales herramientas para
          presentar su consulta y organizar su agenda, y ofrece a los pacientes un área privada para guardar su
          información y decidir con quién la comparten.
        </P>
        <P>
          Al crear una cuenta o usar el sitio aceptas estos términos y los documentos que los integran (sección 17). Si no
          estás de acuerdo, no uses la plataforma.
        </P>
      </>
    ),
  },
  {
    id: 'no-presta',
    title: 'Lo que Guía Médica Monagas no hace',
    body: (
      <>
        <P>Guía Médica Monagas no presta, por sí misma ni por cuenta de los profesionales, ninguno de estos servicios:</P>
        <Ul items={NOT_PROVIDED_SERVICES} />
        <P>
          La plataforma no sustituye al médico tratante, no garantiza resultados médicos y no participa en el acto médico.
          El detalle está en el <DocLink to="descargo-medico" />.
        </P>
      </>
    ),
  },
  {
    id: 'profesionales-independientes',
    title: 'Profesionales independientes',
    body: (
      <>
        <P>
          Los médicos que aparecen en el directorio ejercen de forma <strong>independiente</strong>. No son empleados,
          agentes ni representantes de Guía Médica Monagas, y la plataforma no dirige ni supervisa sus decisiones
          clínicas, sus honorarios, sus horarios ni la forma en que atienden.
        </P>
        <P>
          <strong>El uso del sitio no crea una relación médico-paciente entre Guía Médica Monagas y el usuario.</strong>{' '}
          La relación asistencial nace entre el paciente y el profesional que lo atiende, fuera de la plataforma, y se rige
          por las normas del ejercicio profesional.
        </P>
      </>
    ),
  },
  {
    id: 'emergencias',
    title: 'Emergencias y automedicación',
    body: (
      <>
        <Callout tone="red" title="No uses este sitio para una emergencia">
          {EMERGENCY_NOTICE}
        </Callout>
        <P>
          La información general del sitio (perfiles, publicaciones, descripciones de especialidades) no es una receta ni
          una indicación de tratamiento. No inicies, cambies ni suspendas un tratamiento con base en ella, y no uses
          recetas destinadas a otra persona.
        </P>
      </>
    ),
  },
  {
    id: 'cuentas',
    title: 'Cuentas de usuario',
    body: (
      <Ul
        items={[
          'Los datos que registres deben ser verdaderos, propios y estar actualizados.',
          <>
            La cuenta de paciente es solo para personas de 18 años o más (ver <DocLink to="menores" />) y cada paciente
            puede tener una sola cuenta.
          </>,
          'La cuenta es personal e intransferible: no la compartas ni la cedas. Eres responsable de la confidencialidad de tu contraseña y de lo que se haga con tu cuenta mientras no nos avises de un uso no autorizado.',
          'Está prohibido crear cuentas con identidades falsas, suplantar a otra persona o institución, o registrar credenciales profesionales que no te pertenecen.',
          <>
            Puedes cerrar todas tus sesiones y cambiar tu contraseña desde «Seguridad de la cuenta», y pedir el cierre de
            tu cuenta desde el <DocLink to="derechos" />.
          </>,
        ]}
      />
    ),
  },
  {
    id: 'paciente',
    title: 'Perfil privado del paciente',
    body: (
      <>
        <P>
          El perfil del paciente es un espacio privado con la información personal y de salud que el propio paciente
          decide registrar. No es público, no aparece en el directorio ni en buscadores, y ningún médico lo ve sin la
          autorización del paciente.
        </P>
        <P>
          Ese perfil <strong>no es una historia clínica</strong>: no sustituye la historia que corresponde elaborar y
          custodiar al profesional o al establecimiento de salud conforme a sus obligaciones.
        </P>
        <P>
          El tratamiento de estos datos se rige por la <DocLink to="privacidad" />, la política de{' '}
          <DocLink to="datos-de-salud" />, el <DocLink to="consentimiento-paciente" /> y la{' '}
          <DocLink to="autorizacion-medica" />.
        </P>
      </>
    ),
  },
  {
    id: 'profesionales',
    title: 'Profesionales y verificación',
    body: (
      <>
        <P>
          Quien publica un perfil profesional acepta además las <DocLink to="condiciones-profesionales" />. Ningún perfil
          se publica de forma automática: los documentos los revisa una persona del equipo administrativo, según la{' '}
          <DocLink to="verificacion" />.
        </P>
        <P>
          «Verificado» significa que se hicieron las comprobaciones documentales descritas en esa política. No es una
          certificación estatal, una recomendación clínica ni una garantía de resultados. La verificación es gratuita e
          igual para todos los planes.
        </P>
      </>
    ),
  },
  {
    id: 'planes',
    title: 'Planes, visibilidad y pagos',
    body: (
      <>
        <P>
          El directorio es gratuito para los pacientes. Los profesionales pueden contratar planes de pago que añaden
          herramientas y visibilidad, en las condiciones de la política de <DocLink to="pagos" /> y de{' '}
          <DocLink to="reembolsos" />.
        </P>
        <P>
          Un plan de pago nunca compra ni acelera la verificación, y la mayor visibilidad de un perfil (incluido el espacio
          señalado como «Destacado») es comercial: no indica superioridad clínica. Ver <DocLink to="publicidad-medica" />.
        </P>
      </>
    ),
  },
  {
    id: 'contenido',
    title: 'Contenido aportado por los usuarios',
    body: (
      <>
        <P>
          Cada usuario es responsable del contenido que aporta: los datos de su perfil, sus fotografías, publicaciones,
          videos enlazados y mensajes. Debe ser veraz, lícito y no vulnerar derechos de terceros.
        </P>
        <P>
          Guía Médica Monagas puede retirar o dejar de mostrar contenido que incumpla estos términos o la ley, y atiende
          las denuncias por el <DocLink to="reclamos">canal de reclamos</DocLink>. Los derechos sobre el contenido se
          explican en <DocLink to="propiedad-intelectual" />.
        </P>
      </>
    ),
  },
  {
    id: 'uso-aceptable',
    title: 'Uso aceptable y seguridad',
    body: (
      <P>
        No está permitido acceder a cuentas o datos ajenos, extraer información de forma masiva, automatizar el uso del
        sitio sin autorización, intentar vulnerar su seguridad, ni usar los datos obtenidos para acosar o para fines
        distintos de los previstos. Las reglas completas están en la política de <DocLink to="uso-aceptable" />.
      </P>
    ),
  },
  {
    id: 'terceros',
    title: 'Farmacias, laboratorios, clínicas y otros terceros',
    body: (
      <>
        <P>
          El directorio podrá incluir, ahora o en el futuro, a terceros como farmacias, laboratorios, clínicas u otros
          establecimientos. Su sola presencia en el directorio no convierte a Guía Médica Monagas en vendedor, farmacia,
          laboratorio, clínica ni transportista.
        </P>
        <P>
          La dispensación de medicamentos, la entrega de productos, los exámenes y cualquier otro servicio de esos
          terceros se rigen por la relación entre ellos y el usuario. Los hechos exclusivamente imputables a un tercero
          (por ejemplo, un producto equivocado o vencido, un error de dosificación, un retraso o una pérdida en una
          entrega) corresponden a quien resulte responsable conforme a la ley, cuando no exista un acto u omisión
          imputable a Guía Médica Monagas.
        </P>
      </>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspensión y cierre de cuentas',
    body: (
      <>
        <P>Podemos suspender, dejar de publicar o dar de baja una cuenta o un perfil cuando:</P>
        <Ul
          items={[
            'se detecte información falsa, documentos adulterados o suplantación de identidad;',
            'un organismo competente o el Colegio de Médicos informe una suspensión, inhabilitación o sanción;',
            'se haga un uso indebido de datos de pacientes;',
            'se incumplan estos términos, las condiciones para profesionales o las políticas del sitio;',
            'exista fraude en un pago o riesgo para la seguridad de la plataforma o de otros usuarios.',
          ]}
        />
        <P>
          La decisión se comunica al titular de la cuenta con su motivo, y puede reclamarse por el{' '}
          <DocLink to="reclamos">canal de reclamos</DocLink>. Qué ocurre con los datos al cerrar una cuenta está en la
          política de <DocLink to="retencion" />.
        </P>
      </>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Responsabilidad',
    body: (
      <>
        <P>
          <strong>Acto médico.</strong> Guía Médica Monagas no ejecuta el acto médico y no decide el diagnóstico, el
          medicamento, la dosis, la cirugía, el procedimiento, las pruebas, el alta ni el seguimiento. Cuando una
          consecuencia sea exclusivamente atribuible al acto de un profesional independiente (negligencia, impericia,
          imprudencia, error diagnóstico, omisión, prescripción o procedimiento), la responsabilidad corresponde a quien
          resulte responsable conforme a la ley.
        </P>
        <P>
          <strong>Verificación.</strong> Realizamos una verificación documental razonable, pero no sustituimos la
          verificación oficial ante los organismos competentes ni garantizamos la vigencia continua de cada credencial.
          Ante cualquier duda sobre la habilitación de un profesional, consulta al Ministerio del Poder Popular para la
          Salud o al Colegio de Médicos correspondiente.
        </P>
        <P>
          <strong>Disponibilidad.</strong> Trabajamos para que el sitio esté disponible y funcione correctamente, pero
          puede haber interrupciones por mantenimiento, fallas técnicas o causas ajenas a nuestro control.
        </P>
        <Callout title="Límites de estas cláusulas">
          Estas limitaciones se aplican solo dentro de lo que la ley permite. Nada en estos términos excluye ni reduce la
          responsabilidad que la ley atribuya directamente a Guía Médica Monagas por sus propios actos u omisiones, ni los
          derechos irrenunciables de los usuarios.
        </Callout>
      </>
    ),
  },
  {
    id: 'reclamos',
    title: 'Reclamos y solicitudes',
    body: (
      <P>
        Los reclamos, denuncias y solicitudes se presentan por el{' '}
        <Link href="/reclamos" className="text-pine-700 underline">
          canal de reclamos, denuncias y solicitudes legales
        </Link>
        , que entrega un número de seguimiento y conserva la constancia de la respuesta.
      </P>
    ),
  },
  {
    id: 'ley',
    title: 'Ley aplicable',
    body: (
      <P>
        Estos términos se rigen por las leyes de la República Bolivariana de Venezuela. Las controversias se someterán a
        los tribunales venezolanos competentes, sin perjuicio de los derechos irrenunciables que la ley reconozca a cada
        persona. La identificación del operador está en el <DocLink to="aviso-legal" />.
      </P>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios y versiones',
    body: (
      <P>
        Cada versión de estos términos lleva número y fecha. Si los modificamos de forma sustancial, publicaremos la nueva
        versión y te pediremos aceptarla al iniciar sesión. Registramos qué versión aceptó cada usuario y cuándo.
      </P>
    ),
  },
  {
    id: 'documentos',
    title: 'Documentos que integran estos términos',
    body: (
      <>
        <P>Forman parte de estos términos, según el tipo de cuenta y el uso que hagas del sitio:</P>
        <Ul
          items={[
            <>
              <DocLink to="aviso-legal" />, <DocLink to="descargo-medico" /> y <DocLink to="uso-aceptable" />.
            </>,
            <>
              <DocLink to="privacidad" />, <DocLink to="datos-de-salud" />, <DocLink to="cookies" />,{' '}
              <DocLink to="retencion" />, <DocLink to="proveedores" /> y <DocLink to="menores" />.
            </>,
            <>
              Para pacientes: <DocLink to="consentimiento-paciente" /> y <DocLink to="autorizacion-medica" />.
            </>,
            <>
              Para profesionales: <DocLink to="condiciones-profesionales" />, <DocLink to="verificacion" />,{' '}
              <DocLink to="publicidad-medica" />, <DocLink to="pagos" /> y <DocLink to="reembolsos" />.
            </>,
            <>
              <DocLink to="propiedad-intelectual" /> y <DocLink to="reclamos" />.
            </>,
          ]}
        />
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      slug="terminos"
      lead={
        <p>
          Guía Médica Monagas es un directorio tecnológico de profesionales médicos independientes con herramientas
          privadas para pacientes. No presta atención médica ni de emergencia. Estas son las reglas para usarlo.
        </p>
      }
      sections={SECTIONS}
      related={['descargo-medico', 'privacidad', 'condiciones-profesionales', 'uso-aceptable', 'aviso-legal']}
    />
  );
}
