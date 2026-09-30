import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, LegalTable, P, Ul, legalMetadata } from '@/components/legal/LegalPage';
import { SHARE_CODE_NOTICE } from '@/lib/legal';

export const metadata = legalMetadata('autorizacion-medica');

const SECTIONS: LegalSection[] = [
  {
    id: 'principio',
    title: 'Sin autorización, solo tu código de paciente',
    body: (
      <P>
        En su agenda, un médico ve únicamente un código de paciente (por ejemplo, GMM-A4F2): ni tu nombre, ni tu cédula, ni
        tus datos de salud. Para ver algo más necesita una autorización tuya, vigente y registrada. Que un profesional pida
        acceso no basta: decides tú.
      </P>
    ),
  },
  {
    id: 'alcance',
    title: 'Qué puedes autorizar (alcance)',
    body: (
      <>
        <LegalTable
          head={['Alcance', 'Qué ve el médico']}
          rows={[
            ['Nombre', 'Tu nombre y apellido.'],
            ['Contacto', 'Tu teléfono, tus datos de contacto y tu dirección y teléfono para emergencias.'],
            [
              'Salud',
              'Fecha de nacimiento, sexo, grupo sanguíneo, alergias, resumen de tu condición, medicamentos y médicos tratantes.',
            ],
          ]}
        />
        <P>
          Puedes combinar los alcances. <strong>Tu cédula no se comparte con los médicos a través de la plataforma.</strong>
        </P>
      </>
    ),
  },
  {
    id: 'formas',
    title: 'Formas de autorizar',
    body: (
      <Ul
        items={[
          <>
            <strong>Desde «Permisos»</strong>, en tu panel: eliges al médico, el alcance y la duración (de 1 día a 1 año).
          </>,
          <>
            <strong>Al reservar una cita</strong>: puedes marcar qué datos verá ese médico. Si no marcas nada, solo verá tu
            código de paciente.
          </>,
          <>
            <strong>Con tu código o QR</strong>: lo generas en «Mi código», eliges qué alcance tendrá y se lo entregas a tu
            médico (sección 4).
          </>,
        ]}
      />
    ),
  },
  {
    id: 'codigo',
    title: 'Tu código y tu QR',
    body: (
      <>
        <Callout tone="gold" title="Antes de compartirlo">
          {SHARE_CODE_NOTICE}
        </Callout>
        <P>
          <strong>El código no es una autorización universal ni permanente.</strong> Es el medio para que un médico
          concreto inicie tu registro como su paciente:
        </P>
        <Ul
          items={[
            'Es aleatorio y no se puede deducir a partir de tus datos.',
            'Solo puede usarlo un médico con cuenta en la plataforma y perfil publicado o verificado; un perfil suspendido no puede registrar pacientes.',
            'Cuando un médico lo registra, se crea una autorización individual para ese médico, con el alcance que elegiste para tu código y vigencia de un año.',
            'Recibes un aviso cada vez que un médico te registra con tu código.',
            'Si generas un código nuevo, el anterior deja de funcionar al instante. Los médicos que ya te registraron conservan su autorización hasta que venza o la revoques.',
            'Si le revocas el acceso a un médico, no puede volver a registrarte con el mismo código: necesita uno nuevo.',
            'Los intentos con códigos inválidos quedan registrados y están limitados; un código inválido no revela si existe un paciente.',
            'La página a la que lleva el QR no se ofrece a los buscadores.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'registro',
    title: 'Qué queda registrado de cada autorización',
    body: (
      <>
        <Ul
          items={[
            'el paciente y el profesional;',
            'un identificador único de la autorización;',
            'el alcance (categorías de datos);',
            'la fecha de emisión y la fecha de vencimiento;',
            'la revocación, si ocurre, y su fecha;',
            'la versión de este texto vigente al autorizar;',
            'cada acceso posterior del profesional a tus datos.',
          ]}
        />
        <P>Las autorizaciones vencidas o revocadas se conservan como evidencia; ya no dan acceso.</P>
      </>
    ),
  },
  {
    id: 'vencimiento',
    title: 'Vencimiento',
    body: (
      <P>
        Toda autorización tiene fecha de vencimiento: ninguna es indefinida. Al vencer, el médico vuelve a ver solo tu
        código de paciente. Una autorización nueva al mismo médico reemplaza la anterior.
      </P>
    ),
  },
  {
    id: 'revocacion',
    title: 'Revocación inmediata',
    body: (
      <P>
        Puedes revocar cualquier autorización vigente desde{' '}
        <Link href="/paciente/permisos" className="text-pine-700 underline">
          Permisos
        </Link>
        . El efecto es inmediato: el médico deja de ver esos datos en la plataforma. La revocación no borra lo que el
        profesional haya anotado en sus propios registros de consulta mientras tuvo acceso, que quedan bajo su deber de
        secreto.
      </P>
    ),
  },
  {
    id: 'historial',
    title: 'Historial visible para ti',
    body: (
      <P>
        En{' '}
        <Link href="/paciente/privacidad" className="text-pine-700 underline">
          Privacidad y mis datos
        </Link>{' '}
        ves quién consultó tu información, cuándo y con qué alcance, además de las autorizaciones que diste y revocaste.
      </P>
    ),
  },
  {
    id: 'secreto',
    title: 'Deberes del médico que recibe tus datos',
    body: (
      <>
        <P>
          El médico queda obligado por el secreto médico que establece la Ley de Ejercicio de la Medicina —cuyo carácter
          es inviolable y que tu autorización no elimina, solo le permite conocer tus datos para atenderte— y por las{' '}
          <DocLink to="condiciones-profesionales" />:
        </P>
        <Ul
          items={[
            'usar tus datos únicamente para tu atención;',
            'no copiarlos, divulgarlos ni cederlos;',
            'no usarlos para publicidad ni para entrenar inteligencia artificial;',
            'no compartir su cuenta ni tu código con terceros.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'sin-cuenta',
    title: 'Citas registradas por el médico',
    body: (
      <P>
        Si un médico anota en su agenda una cita a tu nombre sin que tengas cuenta en la plataforma, esos datos los cargó
        él y solo él los ve. Esa ficha no te da de alta como usuario de la plataforma.
      </P>
    ),
  },
  {
    id: 'abuso',
    title: 'Si crees que alguien accedió sin tu permiso',
    body: (
      <P>
        Revoca la autorización, genera un código nuevo y cuéntanos lo ocurrido por el{' '}
        <Link href="/reclamos?tipo=UNAUTHORIZED_ACCESS" className="text-pine-700 underline">
          canal de reclamos
        </Link>
        . El acceso indebido a datos personales está sancionado por la Ley Especial contra los Delitos Informáticos.
      </P>
    ),
  },
];

export default function MedicalAuthorizationPage() {
  return (
    <LegalPage
      slug="autorizacion-medica"
      lead={
        <p>
          Tú decides qué médico ve qué datos y por cuánto tiempo. Este documento explica cómo funciona esa autorización,
          incluida la que das al entregar tu código o tu QR.
        </p>
      }
      sections={SECTIONS}
      related={['consentimiento-paciente', 'datos-de-salud', 'derechos', 'condiciones-profesionales', 'privacidad']}
    />
  );
}
