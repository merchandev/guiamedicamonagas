import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('publicidad-medica');

const SECTIONS: LegalSection[] = [
  {
    id: 'principio',
    title: 'Principio',
    body: (
      <P>
        Todo lo que un profesional publica en la plataforma —perfil, biografía, publicaciones, fotos y video de
        presentación— debe ser veraz, comprobable y sobrio, conforme a las reglas sobre publicidad profesional del Código
        de Deontología Médica. El profesional es responsable de su contenido.
      </P>
    ),
  },
  {
    id: 'prohibido',
    title: 'Lo que no se puede publicar',
    body: (
      <Ul
        items={[
          'promesas de curación o de resultados garantizados;',
          'tratamientos presentados como infalibles o «100 % efectivos»;',
          'afirmaciones falsas, exageradas o que puedan inducir a error;',
          'títulos, cargos o credenciales que no se poseen;',
          'especialidades no acreditadas con la credencial correspondiente;',
          'expresiones como «el mejor médico» o «el número 1» sin una base lícita y verificable;',
          'contenido que sugiera que la plataforma recomienda, avala clínicamente o garantiza al profesional.',
        ]}
      />
    ),
  },
  {
    id: 'pacientes',
    title: 'Datos e imágenes de pacientes',
    body: (
      <P>
        No se puede publicar información ni imágenes que permitan identificar a un paciente sin su autorización expresa, ni
        usar datos obtenidos a través de la plataforma para contactar pacientes con fines promocionales. Ver las{' '}
        <DocLink to="condiciones-profesionales" />.
      </P>
    ),
  },
  {
    id: 'planes',
    title: 'Planes, visibilidad y contenido destacado',
    body: (
      <>
        <Callout>
          Un plan de pago aporta herramientas y visibilidad comercial. <strong>No indica superioridad clínica</strong>, y
          ningún resultado destacado debe leerse como una recomendación médica.
        </Callout>
        <Ul
          items={[
            'El orden del directorio prioriza la relevancia de la búsqueda y los perfiles completos; los planes de pago suman un impulso acotado.',
            'Los espacios comerciales se muestran con la etiqueta «Destacado»: son publicidad.',
            'El color de la insignia de verificado (azul, índigo o dorado) refleja el plan contratado, no un grado distinto de verificación ni de calidad.',
            'La verificación es la misma para todos los planes y no se compra.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'contenido-general',
    title: 'Publicaciones y videos',
    body: (
      <P>
        Las publicaciones y los videos de los profesionales son información general: no son una consulta, un diagnóstico ni
        una prescripción, y no deben presentarse como tales. Deben evitar indicaciones de tratamiento dirigidas al público
        y recordar, cuando corresponda, que cada caso requiere evaluación profesional.
      </P>
    ),
  },
  {
    id: 'automatico',
    title: 'Contenido generado por la plataforma',
    body: (
      <P>
        Los textos que la plataforma arma de forma automática (por ejemplo, títulos y descripciones para buscadores) se
        construyen solo con los datos del perfil del profesional. Ningún contenido automático de la plataforma diagnostica,
        prescribe ni recomienda tratamientos.
      </P>
    ),
  },
  {
    id: 'retiro',
    title: 'Revisión y retiro de contenido',
    body: (
      <P>
        La plataforma puede retirar o dejar de mostrar el contenido que incumpla esta política y, ante incumplimientos
        graves o reiterados, suspender el perfil. Cualquier persona puede denunciar un contenido engañoso por el{' '}
        <Link href="/reclamos?tipo=MISLEADING_CONTENT" className="text-pine-700 underline">
          canal de reclamos
        </Link>
        .
      </P>
    ),
  },
];

export default function MedicalAdvertisingPolicyPage() {
  return (
    <LegalPage
      slug="publicidad-medica"
      lead={
        <p>
          Reglas para lo que un profesional publica y para cómo se muestran los espacios comerciales del directorio.
        </p>
      }
      sections={SECTIONS}
      related={['condiciones-profesionales', 'verificacion', 'descargo-medico', 'pagos']}
    />
  );
}
