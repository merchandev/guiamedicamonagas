import { Suspense } from 'react';
import Link from 'next/link';
import { LegalRequestForm } from '@/components/legal/LegalRequestForm';
import { DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';
import { LEGAL_REQUEST_CATEGORIES } from '@/lib/legal-requests';
import { EMERGENCY_NOTICE } from '@/lib/legal';

export const metadata = legalMetadata('reclamos');

const SECTIONS: LegalSection[] = [
  {
    id: 'para-que',
    title: 'Para qué sirve este canal',
    body: (
      <>
        <P>Es el medio oficial para presentar a Guía Médica Monagas:</P>
        <Ul items={LEGAL_REQUEST_CATEGORIES.filter((c) => c.value !== 'OTHER').map((c) => c.label)} />
        <P>
          No es un canal de atención médica ni de emergencias. {EMERGENCY_NOTICE} Los reclamos sobre la atención recibida
          de un profesional corresponden al propio profesional y a los organismos competentes; aquí puedes denunciar lo que
          afecte a su perfil en el directorio.
        </P>
      </>
    ),
  },
  {
    id: 'tramite',
    title: 'Cómo se tramita',
    body: (
      <Ul
        items={[
          <>
            Al enviarla recibes un <strong>número de seguimiento</strong>. Con ese número y tu correo puedes{' '}
            <Link href="/reclamos/estado" className="text-pine-700 underline">
              consultar el estado
            </Link>{' '}
            cuando quieras.
          </>,
          'Una persona del equipo administrativo la revisa y puede pedirte más información.',
          'La respuesta se te comunica por correo y queda disponible en la consulta de estado.',
          'Para las solicitudes sobre datos personales comprobamos antes que quien las presenta es el titular.',
        ]}
      />
    ),
  },
  {
    id: 'constancia',
    title: 'Qué queda registrado',
    body: (
      <P>
        El número de seguimiento, la fecha, la categoría, los datos de contacto de quien la presenta, el estado, la
        respuesta y quién la dio. Ese registro es la constancia del trámite y se conserva según la política de{' '}
        <DocLink to="retencion" />.
      </P>
    ),
  },
];

export default function LegalRequestsPage() {
  return (
    <LegalPage
      slug="reclamos"
      lead={
        <p>
          Reclamos, denuncias y solicitudes sobre tus datos, con número de seguimiento. No necesitas tener cuenta para
          usarlo.{" "}
          <a href="#formulario" className="font-medium text-pine-700 underline">
            Ir al formulario
          </a>
          .
        </p>
      }
      sections={SECTIONS}
      related={['derechos', 'privacidad', 'verificacion', 'seguridad', 'reembolsos', 'propiedad-intelectual']}
    >
      <Suspense fallback={null}>
        <LegalRequestForm />
      </Suspense>
    </LegalPage>
  );
}
