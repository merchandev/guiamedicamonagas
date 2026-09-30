import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';
import { SITE_DOMAIN } from '@/lib/legal';

export const metadata = legalMetadata('propiedad-intelectual');

const SECTIONS: LegalSection[] = [
  {
    id: 'plataforma',
    title: 'Derechos sobre la plataforma',
    body: (
      <P>
        El nombre «Guía Médica Monagas», su identidad gráfica, el dominio {SITE_DOMAIN}, el software, el diseño del sitio,
        sus textos propios y la organización del directorio pertenecen a su titular o se usan con autorización. No se
        permite copiarlos, reproducirlos ni extraer el directorio de forma masiva sin autorización escrita. Ver{' '}
        <DocLink to="uso-aceptable" />.
      </P>
    ),
  },
  {
    id: 'contenido',
    title: 'Contenido de los usuarios',
    body: (
      <>
        <P>Cada usuario conserva los derechos que legalmente le correspondan sobre el contenido original que aporta:</P>
        <Ul items={['fotografías;', 'biografías y textos;', 'publicaciones;', 'certificados y documentos;', 'videos enlazados.']} />
        <P>
          Al cargarlo, concede a Guía Médica Monagas una <strong>licencia limitada</strong>, no exclusiva y gratuita,
          únicamente para operar la función correspondiente: mostrar el perfil público en el directorio, generar la imagen
          con la que el perfil se comparte en redes y buscadores, y conservar los documentos para su verificación. La
          licencia termina cuando el contenido se retira o la cuenta se elimina, salvo lo que deba conservarse según la
          política de <DocLink to="retencion" />.
        </P>
        <P>
          La plataforma no usa ese contenido para fines distintos, no lo vende y no lo utiliza para entrenar modelos de
          inteligencia artificial.
        </P>
      </>
    ),
  },
  {
    id: 'garantias',
    title: 'Lo que declara quien publica',
    body: (
      <Ul
        items={[
          'Que es autor del contenido o tiene autorización para usarlo.',
          'Que cuenta con el consentimiento de las personas que aparecen en sus fotografías y videos.',
          'Que el contenido no infringe derechos de terceros.',
        ]}
      />
    ),
  },
  {
    id: 'datos-personales',
    title: 'Los datos personales no son «propiedad»',
    body: (
      <Callout>
        Los datos personales y de salud no se rigen por las reglas de la propiedad intelectual. Respecto de ellos, cada
        persona es <strong>titular</strong>: tiene derechos de acceso, rectificación, control y decisión sobre quién los
        ve y para qué. Esos derechos están en la <DocLink to="privacidad" /> y en el <DocLink to="derechos" />. La
        plataforma no adquiere ningún derecho de explotación sobre ellos.
      </Callout>
    ),
  },
  {
    id: 'documentos',
    title: 'Documentos de verificación',
    body: (
      <P>
        Los títulos, constancias y documentos de identidad que un profesional o un paciente carga son siempre privados. Se
        usan solo para verificar y no se publican.
      </P>
    ),
  },
  {
    id: 'videos',
    title: 'Videos',
    body: (
      <P>
        El video de presentación de un perfil está alojado en YouTube y se rige, además, por las condiciones de ese
        servicio; el profesional debe tener derecho a publicarlo. Los videos producidos en colaboración dentro del plan
        Agencia son para el profesional, en los términos que se coordinen con él.
      </P>
    ),
  },
  {
    id: 'terceros',
    title: 'Marcas de terceros',
    body: (
      <P>
        Los nombres y logotipos de instituciones, colegios profesionales, bancos, redes sociales y otros terceros que
        aparecen en el sitio pertenecen a sus titulares y se mencionan solo con fines de identificación. Su mención no
        implica patrocinio ni aval.
      </P>
    ),
  },
  {
    id: 'denuncias',
    title: 'Denuncias por infracción',
    body: (
      <>
        <P>
          Si crees que un contenido del sitio infringe tus derechos, denúncialo por el{' '}
          <Link href="/reclamos?tipo=INTELLECTUAL_PROPERTY" className="text-pine-700 underline">
            canal de reclamos, en la categoría de propiedad intelectual
          </Link>
          , indicando:
        </P>
        <Ul
          items={[
            'la obra o el derecho afectado y por qué te pertenece;',
            'la dirección exacta de la página donde está el contenido;',
            'tus datos de contacto.',
          ]}
        />
        <P>
          Revisaremos la denuncia y, si procede, retiraremos el contenido e informaremos a quien lo publicó, que podrá
          presentar su versión.
        </P>
      </>
    ),
  },
];

export default function IntellectualPropertyPage() {
  return (
    <LegalPage
      slug="propiedad-intelectual"
      sections={SECTIONS}
      related={['terminos', 'publicidad-medica', 'privacidad', 'reclamos']}
    />
  );
}
