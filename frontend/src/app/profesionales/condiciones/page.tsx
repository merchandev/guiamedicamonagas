import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('condiciones-profesionales');

const SECTIONS: LegalSection[] = [
  {
    id: 'alcance',
    title: 'A quién se aplican',
    body: (
      <P>
        A todo profesional que crea una cuenta para publicar su perfil en el directorio. Se suman a los{' '}
        <DocLink to="terminos" /> y se aceptan con una casilla propia al registrarse; la plataforma guarda la versión
        aceptada, la fecha y la hora.
      </P>
    ),
  },
  {
    id: 'declaraciones',
    title: 'Lo que el profesional declara',
    body: (
      <>
        <P>Al aceptar estas condiciones declaro que:</P>
        <Ul
          items={[
            'mi identidad es real y los datos que registro son míos;',
            'poseo la habilitación legal para ejercer la medicina en Venezuela;',
            'los títulos, registros y credenciales que presento son auténticos;',
            'las especialidades que anuncio son reales y cuento con la credencial que las respalda;',
            'no he falsificado ni alterado ningún documento o dato.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'actualizacion',
    title: 'Datos al día y deber de aviso',
    body: (
      <Ul
        items={[
          'Mantendré actualizados mis datos, mis documentos y la información de mi perfil.',
          'Avisaré sin demora de cualquier suspensión, inhabilitación, sanción o cambio en mi habilitación para ejercer.',
          'Entregaré los documentos actualizados que la plataforma solicite para reevaluar mi perfil.',
        ]}
      />
    ),
  },
  {
    id: 'confidencialidad',
    title: 'Confidencialidad y datos de los pacientes',
    body: (
      <>
        <P>
          Los datos de un paciente a los que acceda a través de la plataforma están protegidos por el secreto médico, que
          es inviolable y me obliga incluso después de la muerte del paciente (Ley de Ejercicio de la Medicina, artículos
          46 y 52). En consecuencia:
        </P>
        <Ul
          items={[
            'solo accederé a los datos de un paciente con su autorización vigente y únicamente para atenderlo;',
            'no copiaré, exportaré ni reconstruiré bases de datos de pacientes;',
            'no divulgaré, cederé ni venderé esa información;',
            'no la usaré para publicidad, mercadeo ni prospección comercial;',
            'no la usaré para entrenar modelos de inteligencia artificial ni la introduciré en servicios de terceros con ese fin;',
            'si comparto información con otro médico que interviene en el caso, lo haré dentro de los límites de la ley, sabiendo que ese médico queda igualmente obligado al secreto;',
            'avisaré de inmediato si detecto un acceso sospechoso a mi cuenta o a datos de pacientes.',
          ]}
        />
        <P>
          Cada consulta de datos de un paciente queda registrada y el paciente puede verla. El paciente puede revocar su
          autorización en cualquier momento. Ver <DocLink to="autorizacion-medica" />.
        </P>
      </>
    ),
  },
  {
    id: 'credenciales',
    title: 'Cuenta, credenciales y códigos',
    body: (
      <Ul
        items={[
          'Mi cuenta es personal: no la compartiré con asistentes, colegas ni terceros.',
          'Protegeré mi contraseña y cerraré las sesiones que no reconozca.',
          'No compartiré, publicaré ni reutilizaré el código o el QR que un paciente me entregue: sirve solo para registrarlo como mi paciente.',
        ]}
      />
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Responsabilidad profesional',
    body: (
      <>
        <P>Ejerzo de forma independiente y conservo la responsabilidad exclusiva por:</P>
        <Ul
          items={[
            'el diagnóstico;',
            'el tratamiento y la prescripción;',
            'los procedimientos que realice;',
            'el consentimiento informado clínico de mis pacientes;',
            'el seguimiento;',
            'el secreto profesional;',
            'la historia clínica, que me corresponde elaborar y custodiar conforme a mis obligaciones.',
          ]}
        />
        <P>
          Guía Médica Monagas no participa en el acto médico ni dirige mis decisiones clínicas. Las notas y registros que
          lleve en las herramientas de la plataforma son un apoyo a mi consulta: no sustituyen mis obligaciones de
          registro clínico.
        </P>
      </>
    ),
  },
  {
    id: 'relacion',
    title: 'Relación con la plataforma',
    body: (
      <P>
        Publicar un perfil no crea una relación laboral, societaria ni de representación con Guía Médica Monagas. Fijo con
        libertad mis honorarios, horarios y condiciones de atención, y respondo por ellos ante mis pacientes.
      </P>
    ),
  },
  {
    id: 'contenido',
    title: 'Contenido del perfil y publicidad',
    body: (
      <P>
        Soy responsable de la veracidad de mi perfil, mis publicaciones y mi video de presentación, y me comprometo a
        cumplir la política de <DocLink to="publicidad-medica" />: sin promesas de resultados, sin especialidades no
        acreditadas y sin afirmaciones engañosas. Tengo los derechos sobre las fotos y textos que publico, en los términos
        de <DocLink to="propiedad-intelectual" />.
      </P>
    ),
  },
  {
    id: 'agenda',
    title: 'Agenda y citas',
    body: (
      <P>
        Las solicitudes de cita que recibo por la plataforma son un medio de contacto: soy yo quien las confirma, las
        reprograma o las cancela, y quien responde por la atención. Mantendré mis horarios actualizados y avisaré a mis
        pacientes de cualquier cambio.
      </P>
    ),
  },
  {
    id: 'verificacion',
    title: 'Verificación y planes',
    body: (
      <P>
        Acepto que mi perfil se publique según la <DocLink to="verificacion" />, que la verificación es gratuita y que un
        plan de pago no la sustituye. Acepto que mi perfil solo se muestre en el directorio mientras tenga un plan activo:
        la prueba gratuita de 14 días del plan Plus, una sola vez, o un plan pagado. Sin plan, mis datos, mis documentos y
        las citas ya reservadas se conservan. Las condiciones comerciales de los planes y de la prueba están en{' '}
        <DocLink to="pagos" /> y <DocLink to="reembolsos" />.
      </P>
    ),
  },
  {
    id: 'incumplimiento',
    title: 'Incumplimiento',
    body: (
      <>
        <P>
          El incumplimiento de estas condiciones —en especial la presentación de documentos falsos o el uso indebido de
          datos de pacientes— puede dar lugar a la suspensión o baja del perfil, sin perjuicio de las responsabilidades
          legales y gremiales que correspondan.
        </P>
        <Callout>
          El acceso indebido a datos personales y su revelación o uso sin consentimiento están sancionados por la Ley
          Especial contra los Delitos Informáticos, con agravantes cuando se abusa de una posición de acceso a información
          reservada.
        </Callout>
      </>
    ),
  },
];

export default function ProfessionalTermsPage() {
  return (
    <LegalPage
      slug="condiciones-profesionales"
      lead={
        <p>
          Las reglas para quienes publican un perfil profesional. Están escritas en primera persona porque son la
          declaración que cada profesional acepta al registrarse.
        </p>
      }
      sections={SECTIONS}
      related={['verificacion', 'publicidad-medica', 'autorizacion-medica', 'pagos', 'reembolsos', 'terminos']}
    />
  );
}
