import { Callout, DocLink, LegalPage, type LegalSection, LegalTable, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('proveedores');

const SECTIONS: LegalSection[] = [
  {
    id: 'principio',
    title: 'Principio',
    body: (
      <P>
        La plataforma se opera con el menor número posible de terceros. La aplicación, la base de datos, el almacenamiento
        de archivos, la revisión de los archivos subidos y los registros del sistema funcionan en infraestructura
        administrada directamente por el operador: esos datos no se envían a servicios externos para procesarlos.
      </P>
    ),
  },
  {
    id: 'categorias',
    title: 'Categorías de proveedores',
    body: (
      <>
        <LegalTable
          head={['Categoría', 'Por qué interviene', 'Qué datos alcanza']}
          rows={[
            [
              'Alojamiento (servidor)',
              'Aporta el servidor donde funcionan la aplicación, la base de datos y el almacenamiento de archivos.',
              'Todos los datos de la plataforma residen en ese servidor. Los datos sensibles de los pacientes están cifrados antes de guardarse.',
            ],
            [
              'Copias de seguridad',
              'Permiten recuperar el servicio ante una falla.',
              'Copias cifradas de la base de datos y de los archivos.',
            ],
            [
              'Correo electrónico',
              'Entrega los avisos de la cuenta, las citas y las solicitudes.',
              'La dirección de correo del destinatario y el contenido del aviso.',
            ],
            [
              'Mensajería (por ejemplo, WhatsApp)',
              'Entregaría avisos por mensaje si esa función se activa. Hoy no está activa.',
              'El número de teléfono del destinatario y el contenido del aviso.',
            ],
            [
              'Mapas',
              'Muestra la ubicación del consultorio en el perfil de un médico que la indicó (Google Maps).',
              'Datos técnicos del navegador del visitante, como su dirección IP. No recibe datos de la cuenta.',
            ],
            [
              'Video',
              'Sirve la imagen de portada y reproduce el video de presentación de un perfil, alojado en YouTube. El reproductor se carga solo cuando el visitante pulsa para verlo.',
              'Datos técnicos del navegador del visitante, como su dirección IP. No recibe datos de la cuenta.',
            ],
            [
              'Tasa de cambio',
              'La plataforma consulta la tasa oficial publicada por el Banco Central de Venezuela.',
              'Ningún dato personal.',
            ],
          ]}
        />
        <P>
          Actualmente la plataforma no usa redes de distribución de contenido, servicios externos de analítica, de
          monitoreo ni de atención al cliente que reciban datos personales.
        </P>
      </>
    ),
  },
  {
    id: 'identificacion',
    title: 'Identificación y ubicación',
    body: (
      <Callout tone="gold" title="Información en proceso de publicación">
        El nombre de los proveedores de alojamiento y de correo, y el país donde se almacenan los datos, se publicarán en
        esta página junto con los datos de identificación del operador (ver <DocLink to="aviso-legal" />). Cualquier
        cambio de proveedor que afecte a datos personales se reflejará aquí con una nueva versión.
      </Callout>
    ),
  },
  {
    id: 'limites',
    title: 'Límites que se exigen a los proveedores',
    body: (
      <Ul
        items={[
          'Tratar los datos solo para prestar su servicio a la plataforma, no para fines propios.',
          'Mantener la confidencialidad y aplicar medidas de seguridad adecuadas.',
          'No vender, ceder ni reutilizar los datos.',
          'No usar los datos para publicidad ni para elaborar perfiles.',
        ]}
      />
    ),
  },
  {
    id: 'ia',
    title: 'Inteligencia artificial',
    body: (
      <P>
        La plataforma no envía datos personales ni de salud a servicios de inteligencia artificial. Si en el futuro un
        proveedor que reciba información privada ofreciera funciones de ese tipo, deberá configurarse para impedir que esos
        datos se usen para entrenar modelos, y cualquier integración requerirá antes una revisión legal y técnica.
      </P>
    ),
  },
  {
    id: 'transferencias',
    title: 'Otras transferencias',
    body: (
      <P>
        Fuera de estos proveedores, tus datos solo se comunican a los médicos que tú autorices y a las autoridades
        competentes cuando exista un fundamento jurídico válido, como explica la <DocLink to="privacidad" />. No hay
        cesiones a anunciantes, aseguradoras, farmacias, laboratorios ni otros comercios.
      </P>
    ),
  },
];

export default function ProvidersPolicyPage() {
  return (
    <LegalPage
      slug="proveedores"
      lead={<p>Qué terceros intervienen en el funcionamiento técnico de la plataforma, para qué y con qué límites.</p>}
      sections={SECTIONS}
      related={['privacidad', 'cookies', 'retencion', 'seguridad']}
    />
  );
}
