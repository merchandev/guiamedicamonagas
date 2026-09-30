import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';
import { DATA_CONTROLLER, SITE_DOMAIN } from '@/lib/legal';

export const metadata = legalMetadata('aviso-legal');

const PENDING = 'Pendiente de publicación';

// Se muestran siempre: lo que falte aparece como «pendiente», nunca con datos de ejemplo.
const OPERATOR_ROWS: { label: string; value: string | null }[] = [
  { label: 'Denominación comercial', value: 'Guía Médica Monagas' },
  { label: 'Sitio web', value: SITE_DOMAIN },
  { label: 'Titular del sitio (nombre o razón social)', value: DATA_CONTROLLER.legalName },
  { label: 'RIF', value: DATA_CONTROLLER.rif },
  { label: 'Domicilio', value: DATA_CONTROLLER.address },
  { label: 'Responsable del tratamiento de datos', value: DATA_CONTROLLER.responsibleName ?? DATA_CONTROLLER.legalName },
  { label: 'Correo para asuntos legales', value: DATA_CONTROLLER.legalEmail },
  { label: 'Correo de privacidad', value: DATA_CONTROLLER.privacyEmail },
  { label: 'Correo de soporte', value: DATA_CONTROLLER.supportEmail },
  { label: 'Correo de seguridad', value: DATA_CONTROLLER.securityEmail },
];

const operatorIncomplete = OPERATOR_ROWS.some((row) => !row.value);

const SECTIONS: LegalSection[] = [
  {
    id: 'operador',
    title: 'Titular y operador del sitio',
    body: (
      <>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          {OPERATOR_ROWS.map((row) => (
            <div key={row.label} className="contents">
              <dt className="font-medium text-ink-900">{row.label}</dt>
              <dd className={row.value ? undefined : 'text-ink-500'}>{row.value ?? PENDING}</dd>
            </div>
          ))}
        </dl>
        {operatorIncomplete && (
          <Callout tone="gold" title="Datos en proceso de publicación">
            Los datos de identificación que aparecen como «pendiente de publicación» se incorporarán a este aviso con una
            nueva versión. Mientras tanto, el medio oficial para comunicarte con el operador es el{' '}
            <Link href="/reclamos" className="font-medium underline">
              canal de reclamos y solicitudes
            </Link>
            , que entrega un número de seguimiento y conserva la constancia de tu comunicación.
          </Callout>
        )}
      </>
    ),
  },
  {
    id: 'objeto',
    title: 'Qué es este sitio',
    body: (
      <>
        <P>
          Guía Médica Monagas es una plataforma tecnológica de directorio: permite encontrar, identificar y contactar a
          profesionales médicos independientes del estado Monagas, y ofrece a los pacientes un área privada para guardar
          su información y decidir con quién la comparten.
        </P>
        <P>
          La plataforma no presta atención médica ni de emergencia, no diagnostica, no prescribe y no vende medicamentos
          ni productos. El alcance completo está en los <DocLink to="terminos" /> y en el <DocLink to="descargo-medico" />
          .
        </P>
      </>
    ),
  },
  {
    id: 'contacto',
    title: 'Medios oficiales de contacto',
    body: (
      <Ul
        items={[
          <>
            <Link href="/reclamos" className="text-pine-700 underline">
              Canal de reclamos, denuncias y solicitudes legales
            </Link>
            : para reclamos, denuncias, solicitudes sobre tus datos, reportes de seguridad y requerimientos de
            autoridades. Cada solicitud recibe un número de seguimiento.
          </>,
          'Avisos dentro de tu cuenta y al correo con el que te registraste: es el medio por el que la plataforma se comunica contigo.',
          'Los correos electrónicos indicados arriba, a medida que se publiquen.',
        ]}
      />
    ),
  },
  {
    id: 'normas',
    title: 'Marco normativo',
    body: (
      <>
        <P>La plataforma se diseñó y opera tomando como referencia, entre otras, las siguientes normas venezolanas:</P>
        <Ul
          items={[
            <>
              <strong>Constitución de la República Bolivariana de Venezuela</strong>, artículo 28 (derecho de toda
              persona a acceder a los datos que sobre ella consten en registros, conocer su uso y finalidad, y pedir su
              actualización, rectificación o destrucción) y artículo 60 (protección del honor, la vida privada, la
              intimidad, la propia imagen, la confidencialidad y la reputación).
            </>,
            <>
              <strong>Ley Especial contra los Delitos Informáticos</strong>, en particular lo relativo al acceso
              indebido, la revelación de información y la violación de la privacidad de los datos personales y de las
              comunicaciones.
            </>,
            <>
              <strong>Ley de Ejercicio de la Medicina</strong>, en lo relativo al secreto médico y a la autorización del
              paciente.
            </>,
            <>
              <strong>Código de Deontología Médica</strong>, en lo relativo al secreto profesional y a la publicidad
              médica.
            </>,
            <>
              <strong>Ley sobre Mensajes de Datos y Firmas Electrónicas</strong>, en lo relativo al valor de las
              aceptaciones y comunicaciones hechas por medios electrónicos.
            </>,
          ]}
        />
        <P>
          Esta enumeración es informativa: no limita la aplicación de cualquier otra norma venezolana que corresponda.
        </P>
      </>
    ),
  },
  {
    id: 'marca',
    title: 'Marca, dominio y propiedad intelectual',
    body: (
      <P>
        El nombre «Guía Médica Monagas», su identidad gráfica, el dominio {SITE_DOMAIN}, el software y el diseño del sitio
        pertenecen a su titular o se usan con autorización. Las reglas sobre el contenido que aportan los usuarios están en
        la política de <DocLink to="propiedad-intelectual" />.
      </P>
    ),
  },
  {
    id: 'ley',
    title: 'Ley aplicable y jurisdicción',
    body: (
      <P>
        Este sitio y sus documentos legales se rigen por las leyes de la República Bolivariana de Venezuela. Las
        controversias se someterán a los tribunales venezolanos competentes, sin perjuicio de los derechos irrenunciables
        que la ley reconozca a cada persona.
      </P>
    ),
  },
  {
    id: 'versiones',
    title: 'Vigencia y versiones',
    body: (
      <P>
        Cada documento legal del sitio lleva su número de versión y su fecha. Cuando un texto cambia de forma sustancial se
        publica una versión nueva y, si es un texto que requiere aceptación, la plataforma la solicita de nuevo y registra
        qué versión aceptó cada usuario y cuándo.
      </P>
    ),
  },
];

export default function LegalNoticePage() {
  return (
    <LegalPage
      slug="aviso-legal"
      lead={<p>Quién está detrás de Guía Médica Monagas, cómo contactarlo y bajo qué normas opera el sitio.</p>}
      sections={SECTIONS}
      related={['terminos', 'privacidad', 'propiedad-intelectual', 'reclamos']}
    />
  );
}
