import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';
import { DATA_CONTROLLER } from '@/lib/legal';

export const metadata = legalMetadata('seguridad');

const SECTIONS: LegalSection[] = [
  {
    id: 'medidas',
    title: 'Cómo protegemos la plataforma',
    body: (
      <>
        <Ul
          items={[
            'Todas las conexiones con el sitio viajan cifradas.',
            'Los datos más sensibles de los pacientes se cifran antes de guardarse, con claves separadas de la base de datos.',
            'Las contraseñas no se guardan: solo un resumen irreversible.',
            'Los documentos, fotos y comprobantes están en almacenamiento privado y se abren con enlaces temporales.',
            'Los archivos que se suben se comprueban antes de aceptarse, incluida una revisión contra software malicioso.',
            'Los permisos administrativos se asignan por función y las acciones sensibles quedan en un registro de auditoría.',
            'Hay límites de intentos para frenar ataques automatizados y bloqueo temporal tras varios intentos fallidos de inicio de sesión.',
            'Las sesiones pueden cerrarse a distancia.',
            'Se hacen copias de seguridad cifradas.',
          ]}
        />
        <P>
          No publicamos detalles técnicos que facilitarían un ataque. Ningún sistema es infalible: si detectamos un
          incidente que afecte datos personales, actuaremos como indica la <DocLink to="privacidad" />.
        </P>
      </>
    ),
  },
  {
    id: 'tu-parte',
    title: 'Lo que puedes hacer tú',
    body: (
      <Ul
        items={[
          'Usa una contraseña larga y que no repitas en otros sitios.',
          <>
            Si notas algo extraño, cambia tu contraseña y cierra todas tus sesiones desde{' '}
            <Link href="/cuenta/seguridad" className="text-pine-700 underline">
              Seguridad de la cuenta
            </Link>
            .
          </>,
          'Si eres paciente, entrega tu código o tu QR solo a tu médico y genera uno nuevo si crees que alguien más lo tiene.',
          'Desconfía de mensajes que te pidan tu contraseña o un código: el equipo de la plataforma nunca te los pedirá.',
        ]}
      />
    ),
  },
  {
    id: 'vulnerabilidades',
    title: 'Reporte de vulnerabilidades',
    body: (
      <>
        <P>
          Si encontraste una falla de seguridad, avísanos por el{' '}
          <Link href="/reclamos?tipo=SECURITY" className="text-pine-700 underline">
            canal de reclamos, en la categoría de seguridad
          </Link>
          {DATA_CONTROLLER.securityEmail ? <> o escribiendo a {DATA_CONTROLLER.securityEmail}</> : null}. Incluye:
        </P>
        <Ul
          items={[
            'qué parte del sitio está afectada (dirección de la página o función);',
            'los pasos para reproducir la falla;',
            'qué impacto crees que tiene;',
            'cómo contactarte.',
          ]}
        />
        <Callout title="Reglas para investigar de buena fe">
          No accedas a datos de otras personas ni los descargues: usa solo cuentas propias. No degrades el servicio ni uses
          pruebas destructivas o automatizadas de forma masiva. No divulgues la falla hasta que esté corregida. No incluyas
          datos personales de terceros en el reporte.
        </Callout>
        <P>Atendemos estos reportes con prioridad y te informaremos del resultado por el mismo canal.</P>
      </>
    ),
  },
  {
    id: 'abuso',
    title: 'Uso indebido',
    body: (
      <P>
        Las conductas prohibidas y sus consecuencias están en la política de <DocLink to="uso-aceptable" />.
      </P>
    ),
  },
];

export default function SecurityPage() {
  return (
    <LegalPage
      slug="seguridad"
      lead={<p>Las medidas con las que protegemos tu información y cómo avisarnos de una falla de seguridad.</p>}
      sections={SECTIONS}
      related={['uso-aceptable', 'privacidad', 'datos-de-salud', 'reclamos']}
    />
  );
}
