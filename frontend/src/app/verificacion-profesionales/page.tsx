import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, LegalTable, P, Ul, legalMetadata } from '@/components/legal/LegalPage';
import { VERIFICATION_NOTICE } from '@/lib/legal';

export const metadata = legalMetadata('verificacion');

const LAW = 'Requisito de la Ley de Ejercicio de la Medicina';
const QUALIFICATION = 'Habilitación profesional';
const PLATFORM = 'Política de la plataforma';

// En el orden en que un médico los obtiene en Venezuela (mismo orden que su panel).
const REQUIREMENTS: [string, string][] = [
  ['Cédula de identidad vigente', `Identidad · ${PLATFORM}`],
  ['RIF actualizado', `Fiscal · ${PLATFORM}`],
  ['Título de Médico Cirujano, registrado ante el Registro Principal', LAW],
  ['Registro del título ante el Ministerio del Poder Popular para la Salud (MPPS / SACS)', QUALIFICATION],
  ['Inscripción en el Colegio de Médicos del estado donde ejerce', QUALIFICATION],
  ['Constancia de cumplimiento del artículo 8 (servicio rural o internado rotatorio)', LAW],
];

const SECTIONS: LegalSection[] = [
  {
    id: 'significado',
    title: 'Qué significa «verificado»',
    body: (
      <>
        <P>
          «Verificado» significa que una persona del equipo administrativo de Guía Médica Monagas revisó y aprobó{' '}
          <strong>todos</strong> los documentos que esta política exige a ese profesional.
        </P>
        <Callout>{VERIFICATION_NOTICE}</Callout>
      </>
    ),
  },
  {
    id: 'no-significa',
    title: 'Qué no significa',
    body: (
      <Ul
        items={[
          'No es una certificación del Estado ni sustituye los registros oficiales.',
          'No es una recomendación médica ni una preferencia de la plataforma por ese profesional.',
          'No garantiza la competencia del profesional ni la calidad de su atención.',
          'No garantiza que no tenga o no vaya a tener sanciones.',
          'No garantiza resultados.',
        ]}
      />
    ),
  },
  {
    id: 'documentos',
    title: 'Documentos que se revisan',
    body: (
      <>
        <LegalTable head={['Documento', 'Naturaleza']} rows={REQUIREMENTS} />
        <P>
          <strong>Especialistas.</strong> Quien se anuncia como especialista debe presentar además su título de postgrado
          o especialización y la credencial de reconocimiento de la especialidad, que pasan a formar parte de los
          documentos exigidos para su verificación.
        </P>
        <P className="text-sm text-ink-500">
          Opcional: el registro INPREMÉDICO u otros registros históricos. No son requisito.
        </P>
      </>
    ),
  },
  {
    id: 'proceso',
    title: 'Cómo es el proceso',
    body: (
      <Ul
        items={[
          'El profesional carga sus documentos desde su panel. Los archivos se guardan en almacenamiento privado: nunca se publican.',
          'Una persona del equipo administrativo revisa cada documento y lo aprueba o lo rechaza indicando el motivo. No hay aprobación automática.',
          'El profesional puede corregir y volver a cargar un documento rechazado.',
          'Cada revisión queda registrada con quién la hizo y cuándo.',
        ]}
      />
    ),
  },
  {
    id: 'publicacion',
    title: 'Cuándo aparece un perfil en el directorio',
    body: (
      <>
        <LegalTable
          head={['Estado', 'Condición', 'Cómo se muestra']}
          rows={[
            [
              'No publicado',
              'Menos del 60 % de los documentos aprobados, o falta la biografía, la foto o un plan activo.',
              'No aparece en el directorio.',
            ],
            [
              'Verificación en curso',
              'Al menos el 60 % de los documentos aprobados, con biografía, foto de perfil y un plan pagado.',
              'Aparece con la leyenda «verificación en curso», sin la insignia de verificado.',
            ],
            [
              'Verificado',
              'El 100 % de los documentos exigidos aprobados, con biografía, foto de perfil y un plan pagado o la prueba gratuita.',
              'Aparece con la insignia de verificado.',
            ],
          ]}
        />
        <P>
          Un perfil con «verificación en curso» <strong>no está verificado</strong>: parte de sus documentos sigue en
          revisión.
        </P>
        <P>
          La primera vez que un perfil sin plan pagado reúne el 100 % de los documentos aprobados, la biografía y la foto,
          se publica con la prueba gratuita de 14 días del plan Plus. Al terminar la prueba sin un plan pagado, deja de
          mostrarse hasta que se active uno. La verificación no cambia por eso. Ver <DocLink to="pagos" />.
        </P>
      </>
    ),
  },
  {
    id: 'fuentes',
    title: 'Fuentes y alcance de la comprobación',
    body: (
      <P>
        La verificación es documental: se revisan los documentos que presenta el propio profesional. No sustituye la
        consulta ante los organismos oficiales, que son la fuente definitiva sobre la habilitación de un médico. Ante
        cualquier duda, consulta al Ministerio del Poder Popular para la Salud o al Colegio de Médicos correspondiente.
      </P>
    ),
  },
  {
    id: 'registros',
    title: 'Números de registro visibles',
    body: (
      <P>
        Como práctica de transparencia, el perfil público de cada médico muestra sus números de registro (MPPS y Colegio de
        Médicos) para que cualquiera pueda contrastarlos. Un profesional puede registrar matrículas de Colegios de
        distintos estados.
      </P>
    ),
  },
  {
    id: 'vigencia',
    title: 'Vigencia, actualizaciones y reevaluación',
    body: (
      <>
        <P>
          La verificación refleja los documentos aprobados en la fecha de su revisión; no es una comprobación continua. El
          profesional está obligado a mantener sus datos al día y a avisar de cualquier suspensión, inhabilitación o
          cambio en su habilitación.
        </P>
        <P>
          La plataforma puede pedir documentos actualizados y volver a revisar un perfil en cualquier momento, en especial
          si recibe una denuncia o una comunicación de un organismo competente.
        </P>
      </>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspensión',
    body: (
      <P>
        Un perfil puede suspenderse o dejar de publicarse si se detectan documentos falsos o adulterados, si un organismo
        competente informa una suspensión o sanción, o si el profesional incumple las{' '}
        <DocLink to="condiciones-profesionales" />. Un perfil suspendido no aparece en el directorio ni puede registrar
        pacientes.
      </P>
    ),
  },
  {
    id: 'planes',
    title: 'La verificación no se compra',
    body: (
      <P>
        La verificación es <strong>gratuita y la misma para todos</strong>. Ningún plan de pago la sustituye, la acelera ni
        la mejora. El color de la insignia (azul, índigo o dorado) solo refleja el plan contratado: no indica un nivel
        distinto de verificación ni de calidad. Ver <DocLink to="pagos" />.
      </P>
    ),
  },
  {
    id: 'falsificacion',
    title: 'Documentos falsos',
    body: (
      <P>
        Presentar documentos falsos o adulterados, o atribuirse credenciales ajenas, da lugar a la baja inmediata del
        perfil, sin perjuicio de las acciones legales que correspondan y de la comunicación a los organismos competentes.
      </P>
    ),
  },
  {
    id: 'reclamos',
    title: 'Denuncias y reclamaciones',
    body: (
      <P>
        Si crees que un perfil usa una identidad o una credencial falsa, o que un profesional está suspendido,{' '}
        <Link href="/reclamos?tipo=FALSE_CREDENTIAL" className="text-pine-700 underline">
          denúncialo por el canal de reclamos
        </Link>
        . Un profesional que no esté de acuerdo con una decisión de verificación puede reclamar por el mismo canal.
      </P>
    ),
  },
];

export default function VerificationPolicyPage() {
  return (
    <LegalPage
      slug="verificacion"
      lead={
        <p>
          Ningún perfil profesional se publica de forma automática. Esta política explica qué se comprueba, qué significa
          la insignia de verificado y, sobre todo, qué no garantiza.
        </p>
      }
      sections={SECTIONS}
      related={['condiciones-profesionales', 'publicidad-medica', 'descargo-medico', 'pagos']}
    />
  );
}
