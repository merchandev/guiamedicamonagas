import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';
import { EMERGENCY_NOTICE, MEDICAL_DISCLAIMER_NOTICE } from '@/lib/legal';

export const metadata = legalMetadata('descargo-medico');

const SECTIONS: LegalSection[] = [
  {
    id: 'directorio',
    title: 'Un directorio tecnológico, no un prestador de salud',
    body: (
      <>
        <Callout>
          <strong>
            Guía Médica Monagas es un directorio tecnológico y no un prestador de atención médica.
          </strong>{' '}
          {MEDICAL_DISCLAIMER_NOTICE}
        </Callout>
        <P>
          La plataforma facilita que un usuario encuentre y contacte a un profesional. Lo que ocurre después —la consulta,
          el diagnóstico, el tratamiento y su seguimiento— sucede entre el paciente y el profesional, fuera de la
          plataforma.
        </P>
      </>
    ),
  },
  {
    id: 'no-constituye',
    title: 'Lo que el contenido del sitio no constituye',
    body: (
      <>
        <P>Nada de lo publicado en el sitio, ni el uso de sus funciones, constituye:</P>
        <Ul
          items={[
            'una consulta médica;',
            'un diagnóstico o una evaluación clínica;',
            'un tratamiento o un consejo médico;',
            'una prescripción o una receta;',
            'una segunda opinión;',
            'un servicio de emergencia;',
            'un servicio de telemedicina.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'emergencias',
    title: 'Emergencias',
    body: (
      <Callout tone="red" title="No uses este sitio para una emergencia">
        {EMERGENCY_NOTICE} Los formularios de contacto, las solicitudes de cita y los mensajes del sitio no se atienden en
        tiempo real.
      </Callout>
    ),
  },
  {
    id: 'profesionales',
    title: 'Profesionales independientes y responsabilidad por el acto médico',
    body: (
      <>
        <P>
          Los profesionales del directorio ejercen de forma independiente. Guía Médica Monagas no dirige sus decisiones
          clínicas y no decide el diagnóstico, el medicamento, la dosis, la cirugía, el procedimiento, las pruebas, el alta
          ni el seguimiento.
        </P>
        <P>
          Las consecuencias derivadas exclusivamente de negligencia, impericia, imprudencia, error diagnóstico, omisiones,
          prescripciones o procedimientos realizados por un profesional o por otro tercero corresponden a quien resulte
          jurídicamente responsable de esas actuaciones según la ley aplicable.
        </P>
      </>
    ),
  },
  {
    id: 'automedicacion',
    title: 'Automedicación',
    body: (
      <Ul
        items={[
          'El directorio no prescribe.',
          'La información general del sitio no es una receta ni una indicación para automedicarse.',
          'Una publicación o un artículo no sustituye la evaluación de un profesional.',
          'No inicies, modifiques ni suspendas un tratamiento con base en contenido general.',
          'No uses recetas o indicaciones destinadas a otra persona.',
          'Las decisiones de automedicación tomadas por iniciativa propia no constituyen una indicación de la plataforma.',
        ]}
      />
    ),
  },
  {
    id: 'resultados',
    title: 'Procedimientos y resultados',
    body: (
      <>
        <P>Respecto de cualquier consulta, tratamiento o procedimiento realizado por un profesional, la plataforma no garantiza:</P>
        <Ul
          items={[
            'su seguridad;',
            'su eficacia;',
            'un resultado determinado;',
            'la ausencia de complicaciones;',
            'su idoneidad para una persona en particular.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'informacion',
    title: 'Información de los perfiles',
    body: (
      <>
        <P>
          La información de cada perfil (biografía, especialidades, horarios, sedes, publicaciones, video de presentación)
          la aporta el propio profesional, que es responsable de su veracidad. La plataforma revisa los documentos
          descritos en su <DocLink to="verificacion" />; esa revisión es documental, no clínica.
        </P>
        <P>
          Que un perfil aparezca más arriba, o en un espacio señalado como «Destacado», responde a criterios de relevancia
          y a visibilidad comercial contratada: no es una recomendación clínica. Ver <DocLink to="publicidad-medica" />.
        </P>
      </>
    ),
  },
  {
    id: 'perfil-paciente',
    title: 'Perfil privado del paciente',
    body: (
      <P>
        La información que el paciente registra en su perfil es un resumen aportado por él mismo. No es una historia
        clínica y no sustituye la que corresponde elaborar y custodiar al profesional o al establecimiento de salud.
      </P>
    ),
  },
  {
    id: 'limites',
    title: 'Lo que este descargo no excluye',
    body: (
      <P>
        Este descargo delimita qué hace y qué no hace la plataforma. No excluye ni reduce la responsabilidad que la ley
        atribuya directamente a Guía Médica Monagas por sus propios actos u omisiones en la operación del sitio —por
        ejemplo, la custodia de los datos que almacena o las comprobaciones que declara hacer—, ni los derechos
        irrenunciables de los usuarios.
      </P>
    ),
  },
];

export default function MedicalDisclaimerPage() {
  return (
    <LegalPage
      slug="descargo-medico"
      sections={SECTIONS}
      related={['terminos', 'verificacion', 'publicidad-medica', 'condiciones-profesionales']}
    />
  );
}
