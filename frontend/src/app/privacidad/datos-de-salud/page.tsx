import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('datos-de-salud');

const SECTIONS: LegalSection[] = [
  {
    id: 'cuales',
    title: 'Qué datos consideramos sensibles',
    body: (
      <>
        <P>Tratamos con reglas reforzadas:</P>
        <Ul
          items={[
            <>
              <strong>Información de salud</strong> que el paciente registra: fecha de nacimiento, sexo, grupo sanguíneo,
              alergias, resumen de su condición, medicamentos y horarios, médicos tratantes, y dirección y teléfono para
              emergencias.
            </>,
            <>
              <strong>El motivo de consulta</strong> de cada cita.
            </>,
            <>
              <strong>Datos de identidad del paciente:</strong> cédula, teléfono y la foto de su documento de identidad.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'reglas',
    title: 'Reglas fundamentales',
    body: (
      <>
        <P>Los datos de salud de los pacientes:</P>
        <Ul
          items={[
            'son privados y no aparecen en ninguna página pública;',
            'no se ofrecen a los buscadores para su indexación;',
            'no se venden, alquilan ni ceden;',
            'no se usan para publicidad;',
            'no influyen en el orden del directorio ni en ninguna clasificación;',
            'no se usan para evaluar la capacidad económica de nadie;',
            'no se usan para perfilar compras ni hábitos de consumo;',
            'no se usan para entrenar modelos de inteligencia artificial;',
            'no se comparten automáticamente con ningún médico;',
            'no se comparten con farmacias, laboratorios, aseguradoras ni otros comercios, presentes o futuros;',
            'solo los ve un profesional con la autorización del paciente.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'proteccion',
    title: 'Cómo se protegen',
    body: (
      <Ul
        items={[
          'Se cifran antes de guardarse, con claves que se custodian separadas de la base de datos: una copia de la base de datos, por sí sola, no permite leerlos.',
          'Viajan siempre por conexiones cifradas.',
          'Están separados de las funciones públicas del directorio y sujetos a control de acceso.',
          'Cada consulta de un profesional queda registrada, y el paciente puede ver ese historial.',
          'Las copias de seguridad se guardan cifradas.',
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
            <>
              <strong>El propio paciente</strong>, desde su cuenta.
            </>,
            <>
              <strong>El médico que el paciente autorice</strong>, solo si la autorización incluye el alcance «Salud» y
              mientras esté vigente. Ver <DocLink to="autorizacion-medica" />.
            </>,
          ]}
        />
        <P>
          Un médico que recibe estos datos queda obligado por el secreto profesional que le impone la Ley de Ejercicio de
          la Medicina y por las <DocLink to="condiciones-profesionales" />: solo puede usarlos para atender a ese
          paciente.
        </P>
      </>
    ),
  },
  {
    id: 'administracion',
    title: 'Personal administrativo: mínimo privilegio',
    body: (
      <>
        <P>
          <strong>Ser administrador no da acceso a los datos de salud.</strong> Las herramientas administrativas de la
          plataforma no muestran la información de salud de los pacientes.
        </P>
        <P>
          Para gestionar las cuentas de los pacientes o verificar su identidad (nombre, cédula y foto del documento), el
          administrador necesita, además de su permiso específico, desbloquear un acceso protegido con un código de
          seguridad. Ese acceso dura pocos minutos y cada apertura queda registrada.
        </P>
      </>
    ),
  },
  {
    id: 'extraordinario',
    title: 'Acceso técnico extraordinario',
    body: (
      <>
        <P>
          La operación del servidor (mantenimiento, copias de seguridad y recuperación ante fallas) está a cargo de un
          número mínimo de personas con acceso a la infraestructura. Ese acceso no está previsto para consultar
          información de salud.
        </P>
        <P>
          Cualquier intervención excepcional sobre los datos de un paciente —por ejemplo, para atender una solicitud suya,
          corregir una falla, investigar un incidente de seguridad o responder a un requerimiento legal válido— debe
          limitarse a lo imprescindible y quedar documentada con su motivo, fecha y responsable.
        </P>
      </>
    ),
  },
  {
    id: 'historia',
    title: 'No es una historia clínica',
    body: (
      <P>
        El perfil privado del paciente es un resumen de salud aportado por el propio paciente. No es una historia clínica
        y no sustituye la que corresponde elaborar y custodiar al profesional o al establecimiento de salud conforme a sus
        obligaciones. La plataforma no comprueba la exactitud de lo que el paciente escribe.
      </P>
    ),
  },
  {
    id: 'terceros',
    title: 'Datos de otras personas',
    body: (
      <P>
        Si registras datos de otras personas (por ejemplo, el nombre de tus médicos tratantes o un teléfono de contacto
        para emergencias), hazlo solo con su conocimiento y limítate a lo necesario.
      </P>
    ),
  },
  {
    id: 'fallecimiento',
    title: 'Fallecimiento del titular',
    body: (
      <P>
        El deber de secreto se mantiene después de la muerte del paciente. Las solicitudes de familiares o herederos sobre
        la cuenta de una persona fallecida se atienden caso por caso por el{' '}
        <Link href="/reclamos?tipo=PRIVACY_RIGHTS" className="text-pine-700 underline">
          canal de solicitudes
        </Link>
        , con la documentación que acredite el fallecimiento y el vínculo, y conforme a la ley.
      </P>
    ),
  },
];

export default function HealthDataPolicyPage() {
  return (
    <LegalPage
      slug="datos-de-salud"
      lead={
        <Callout title="En pocas palabras">
          Tu información de salud es privada. Se guarda cifrada, no se publica, no se vende, no se usa para publicidad ni
          para entrenar inteligencia artificial, y ningún médico la ve sin tu autorización.
        </Callout>
      }
      sections={SECTIONS}
      related={['privacidad', 'consentimiento-paciente', 'autorizacion-medica', 'derechos', 'retencion']}
    />
  );
}
