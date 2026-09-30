import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('uso-aceptable');

const SECTIONS: LegalSection[] = [
  {
    id: 'uso',
    title: 'Uso permitido',
    body: (
      <P>
        Puedes usar el sitio para buscar y contactar profesionales, administrar tu propia cuenta y, si eres profesional,
        gestionar tu perfil y atender a tus pacientes dentro de las funciones que la plataforma ofrece.
      </P>
    ),
  },
  {
    id: 'prohibido',
    title: 'Conductas prohibidas',
    body: (
      <Ul
        items={[
          'acceder o intentar acceder a cuentas, datos o áreas del sistema sin autorización;',
          'compartir credenciales o usar las de otra persona;',
          'robar, copiar o reutilizar el código o el QR de un paciente, o usarlo sin que él lo haya entregado;',
          'probar contraseñas o códigos de forma masiva (fuerza bruta);',
          'extraer datos privados, o datos del directorio de forma masiva, por medios automatizados (scraping);',
          'automatizar el uso del sitio sin autorización;',
          'hacer ingeniería inversa del sistema con fines maliciosos;',
          'explotar vulnerabilidades o degradar el servicio;',
          'subir archivos con software malicioso;',
          'suplantar a una persona, a un profesional o a una institución;',
          'cometer fraude, incluido el reporte de pagos falsos;',
          'usar datos obtenidos en la plataforma para acosar, discriminar o contactar a alguien con fines no solicitados;',
          'intentar reidentificar a una persona a partir de información anonimizada o de un código de paciente.',
        ]}
      />
    ),
  },
  {
    id: 'consecuencias',
    title: 'Consecuencias',
    body: (
      <>
        <P>
          El incumplimiento puede dar lugar al bloqueo de solicitudes, a la suspensión o baja de la cuenta y a la
          conservación de los registros necesarios para investigar lo ocurrido.
        </P>
        <Callout>
          Varias de estas conductas son delito según la Ley Especial contra los Delitos Informáticos, entre ellas el
          acceso indebido y la obtención, revelación o uso de datos personales sin consentimiento. Guía Médica Monagas
          puede denunciarlas ante las autoridades competentes.
        </Callout>
      </>
    ),
  },
  {
    id: 'medidas',
    title: 'Medidas de protección',
    body: (
      <P>
        Para proteger a los usuarios, la plataforma limita el número de intentos, registra las acciones sensibles y cierra
        las sesiones de una cuenta cuando detecta un uso anómalo de sus credenciales. Ver <DocLink to="seguridad" />.
      </P>
    ),
  },
  {
    id: 'reporte',
    title: 'Reportar un abuso o una falla',
    body: (
      <P>
        Si detectas un uso indebido, una suplantación o una vulnerabilidad, repórtalo por el{' '}
        <Link href="/reclamos?tipo=SECURITY" className="text-pine-700 underline">
          canal de reclamos, en la categoría de seguridad
        </Link>
        . Si el reporte es sobre una falla técnica, sigue las indicaciones de <DocLink to="seguridad" />.
      </P>
    ),
  },
];

export default function AcceptableUsePolicyPage() {
  return (
    <LegalPage
      slug="uso-aceptable"
      lead={<p>Lo que no está permitido hacer en la plataforma y qué ocurre si se hace.</p>}
      sections={SECTIONS}
      related={['seguridad', 'terminos', 'privacidad', 'reclamos']}
    />
  );
}
