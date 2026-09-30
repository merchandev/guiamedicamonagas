import { CookiePreferencesButton } from '@/components/legal/CookiePreferencesButton';
import { DocLink, LegalPage, type LegalSection, LegalTable, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('cookies');

const SECTIONS: LegalSection[] = [
  {
    id: 'que-son',
    title: 'Qué son',
    body: (
      <P>
        Las cookies son pequeños archivos que un sitio guarda en tu navegador. El almacenamiento local del navegador cumple
        una función parecida. Este sitio usa ambos solo para lo que se describe aquí.
      </P>
    ),
  },
  {
    id: 'cuales',
    title: 'Qué guarda este sitio en tu navegador',
    body: (
      <>
        <LegalTable
          head={['Nombre', 'Categoría', 'Para qué', 'Duración']}
          rows={[
            [
              <code key="a">gmm_refresh_token</code>,
              'Necesaria · autenticación',
              'Mantiene tu sesión iniciada. El navegador no permite que los scripts de la página la lean.',
              '7 días',
            ],
            [
              <code key="b">gmm_patient_vault</code>,
              'Necesaria · seguridad',
              'Solo para administradores: mantiene abierto, por tiempo limitado, el acceso protegido a los registros de pacientes.',
              '15 minutos',
            ],
            [
              <code key="c">gmm_cookie_consent</code>,
              'Preferencias',
              'Recuerda tu elección sobre cookies para no volver a preguntarte. Se guarda en el almacenamiento local.',
              'Hasta que la borres',
            ],
            [
              <code key="d">gmm_current_org</code>,
              'Preferencias',
              'Solo para cuentas de organización: recuerda cuál estás administrando. Se guarda en el almacenamiento local.',
              'Hasta que la borres',
            ],
          ]}
        />
        <P>Las cookies necesarias no se pueden desactivar: sin ellas no es posible iniciar sesión de forma segura.</P>
      </>
    ),
  },
  {
    id: 'analitica',
    title: 'Analítica',
    body: (
      <>
        <P>
          La analítica del sitio es propia: no usamos servicios de analítica de terceros ni cookies de seguimiento. Si la
          aceptas, se registran conteos de uso —por ejemplo, cuántas veces se visitó un perfil o se pulsó un botón de
          contacto— <strong>sin tu dirección IP ni tu navegador</strong>.
        </P>
        <P>Si la rechazas, esos conteos no se registran. El sitio funciona igual.</P>
      </>
    ),
  },
  {
    id: 'publicidad',
    title: 'Publicidad',
    body: (
      <P>
        Este sitio no usa cookies publicitarias ni de seguimiento entre sitios. Si alguna vez se incorporaran, sería con una
        categoría propia, desactivada por defecto y sujeta a tu consentimiento por separado, y esta política cambiaría de
        versión.
      </P>
    ),
  },
  {
    id: 'terceros',
    title: 'Contenido de terceros incrustado',
    body: (
      <>
        <P>Algunas páginas pueden mostrar contenido servido por terceros, que aplican sus propias políticas:</P>
        <Ul
          items={[
            <>
              <strong>Mapa de ubicación</strong> en el perfil de un médico que indicó la ubicación de su consultorio: lo
              sirve Google Maps.
            </>,
            <>
              <strong>Video de presentación</strong> en algunos perfiles: está alojado en YouTube. La página muestra la
              imagen de portada, que sirve YouTube, y el reproductor se carga únicamente cuando pulsas para verlo, en su
              modo de privacidad mejorada.
            </>,
          ]}
        />
        <P>
          Al cargarse, esos servicios reciben datos técnicos de tu navegador, como tu dirección IP. Ver{' '}
          <DocLink to="proveedores" />.
        </P>
      </>
    ),
  },
  {
    id: 'eleccion',
    title: 'Cómo decidir y cambiar tu elección',
    body: (
      <>
        <P>
          En tu primera visita puedes aceptar todo, rechazar lo no esencial o configurar. Puedes cambiar tu elección cuando
          quieras desde «Configuración de cookies», en el pie de página, o aquí:
        </P>
        <div className="mt-3">
          <CookiePreferencesButton />
        </div>
        <P>
          Guardamos tu elección como constancia de tu consentimiento, con su fecha, un identificador aleatorio y los datos
          técnicos del momento (dirección IP y navegador). También puedes borrar las cookies y el
          almacenamiento local desde la configuración de tu navegador; si lo haces, se cerrará tu sesión y volveremos a
          preguntarte.
        </P>
      </>
    ),
  },
  {
    id: 'marco',
    title: 'Por qué pedimos tu consentimiento',
    body: (
      <P>
        Pedimos tu consentimiento para todo lo que no sea necesario como una práctica voluntaria de protección de tu vida
        privada, en línea con el artículo 60 de la Constitución. El resto del tratamiento de tus datos se explica en la{' '}
        <DocLink to="privacidad" />.
      </P>
    ),
  },
];

export default function CookiesPolicyPage() {
  return (
    <LegalPage
      slug="cookies"
      lead={
        <p>
          Usamos solo las cookies necesarias para que puedas iniciar sesión de forma segura y, si lo permites, conteos de
          uso anónimos. No hay cookies publicitarias.
        </p>
      }
      sections={SECTIONS}
      related={['privacidad', 'proveedores', 'derechos']}
    />
  );
}
