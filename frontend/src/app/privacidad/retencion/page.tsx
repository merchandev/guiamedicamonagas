import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, LegalTable, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('retencion');

const SECTIONS: LegalSection[] = [
  {
    id: 'criterios',
    title: 'Criterios',
    body: (
      <>
        <P>Conservamos cada dato solo mientras exista una de estas razones:</P>
        <Ul
          items={[
            'es necesario para prestarte la función que usas (tu cuenta está activa);',
            'una norma obliga a conservarlo (por ejemplo, los registros de pagos);',
            'sirve como evidencia de un consentimiento, una autorización o un acceso, o para atender un reclamo;',
            'es necesario para la seguridad del sistema.',
          ]}
        />
        <Callout tone="gold" title="Plazos en definición">
          Esta política describe el criterio y el comportamiento actual de la plataforma para cada tipo de dato. Los plazos
          fijos en los que hoy no hay una eliminación automática (señalados en la tabla) están en definición con asesoría
          legal y se publicarán aquí con una nueva versión.
        </Callout>
      </>
    ),
  },
  {
    id: 'matriz',
    title: 'Conservación por tipo de dato',
    body: (
      <LegalTable
        head={['Dato', 'Cuánto se conserva']}
        rows={[
          ['Cuenta (correo, acceso)', 'Mientras la cuenta esté activa. Se elimina con la eliminación definitiva de la cuenta.'],
          [
            'Perfil del paciente: identidad, contacto y fotos',
            'Mientras la cuenta esté activa. La foto del documento de identidad se borra si la verificación se rechaza. Todo se elimina con la cuenta.',
          ],
          [
            'Información de salud del paciente',
            'Mientras el paciente la mantenga en su perfil: puede modificarla o borrarla cuando quiera. Se elimina con la cuenta.',
          ],
          [
            'Citas y motivo de consulta',
            'Mientras existan las cuentas del paciente y del médico. Al eliminarse la cuenta del paciente, sus citas futuras se cancelan y las pasadas quedan en la agenda del médico solo con el código de paciente, sin su identidad.',
          ],
          [
            'Autorizaciones a médicos',
            'Se conservan como evidencia aunque hayan vencido o se hayan revocado. Al eliminarse una cuenta quedan revocadas y sin los datos de identidad. Plazo fijo en definición.',
          ],
          [
            'Historial de accesos y registro de auditoría',
            'Se conservan como evidencia y por seguridad. Actualmente no tienen eliminación automática. Plazo fijo en definición.',
          ],
          [
            'Aceptaciones de textos legales',
            'Se conservan como evidencia de qué versión se aceptó y cuándo. Al eliminarse la cuenta se les quita la dirección IP, el navegador y el vínculo con la persona.',
          ],
          [
            'Perfil y documentos del profesional',
            'Mientras el perfil exista. Con la eliminación definitiva se borran el perfil, los documentos de verificación, las publicaciones, la agenda, los mensajes recibidos y los registros propios de consulta.',
          ],
          [
            'Pagos, suscripciones y comprobantes',
            'Por el tiempo que exija la normativa tributaria y mercantil aplicable. Si la cuenta se elimina, quedan asociados a un registro anónimo («Cuenta eliminada»).',
          ],
          [
            'Reclamos y solicitudes legales',
            'Se conservan con su respuesta como constancia del trámite. Plazo fijo en definición.',
          ],
          [
            'Preferencias de cookies',
            'La elección se guarda en tu navegador hasta que la borres; la constancia del consentimiento se conserva en el servidor. Plazo fijo en definición.',
          ],
          [
            'Estadísticas de uso',
            'Son conteos sin datos personales. Los de un perfil profesional se borran si la cuenta se elimina.',
          ],
          [
            'Copias de seguridad',
            'Se guardan cifradas y se rotan: las de la base de datos se conservan unas dos semanas y las de archivos unas ocho semanas. Un dato eliminado desaparece de las copias al completarse esa rotación.',
          ],
          [
            'Incidentes de seguridad',
            'La documentación de un incidente se conserva el tiempo necesario para su investigación, para atender reclamos y para cumplir obligaciones legales.',
          ],
        ]}
      />
    ),
  },
  {
    id: 'cierre',
    title: 'Qué ocurre al cerrar una cuenta',
    body: (
      <>
        <P>El cierre tiene dos pasos:</P>
        <Ul
          items={[
            <>
              <strong>Baja.</strong> La cuenta se desactiva: ya no se puede iniciar sesión, se cierran las sesiones
              abiertas y, si es un profesional, su perfil deja de publicarse.
            </>,
            <>
              <strong>Eliminación definitiva.</strong> Se borran los datos personales y los archivos (fotos, documentos),
              y se conserva únicamente lo indicado en la tabla: registros de pago, autorizaciones ya revocadas y sin
              identidad, y registros de auditoría. Esta operación no se puede deshacer.
            </>,
          ]}
        />
        <P>
          Una cuenta con un pago pendiente de revisión, o que sea dueña de una organización, debe resolver antes esa
          situación.
        </P>
      </>
    ),
  },
  {
    id: 'solicitud',
    title: 'Cómo pedir la eliminación',
    body: (
      <P>
        Desde tu panel de paciente, en «Privacidad y mis datos», o por el{' '}
        <Link href="/reclamos?tipo=ACCOUNT_DELETION" className="text-pine-700 underline">
          canal de solicitudes
        </Link>
        . Antes de eliminar, comprobamos que la solicitud proviene del titular de la cuenta. Te recomendamos descargar
        antes una copia de tus datos. Ver <DocLink to="derechos" />.
      </P>
    ),
  },
  {
    id: 'limites',
    title: 'Lo que no se puede eliminar de inmediato',
    body: (
      <Ul
        items={[
          'Los registros que una norma obliga a conservar, como los de pagos.',
          'La evidencia de consentimientos, autorizaciones y accesos, que se conserva sin datos de identidad cuando la cuenta se elimina.',
          'Las copias de seguridad, hasta que termina su rotación.',
          'Los registros que el propio médico lleva fuera de la plataforma, que están bajo su responsabilidad y su deber de secreto.',
        ]}
      />
    ),
  },
];

export default function RetentionPolicyPage() {
  return (
    <LegalPage
      slug="retencion"
      lead={
        <p>
          Guardamos tus datos mientras tu cuenta está activa. Al eliminarla, se borran los datos personales y solo queda lo
          que la ley obliga a conservar o lo que sirve como evidencia, sin tu identidad.
        </p>
      }
      sections={SECTIONS}
      related={['privacidad', 'derechos', 'datos-de-salud', 'proveedores']}
    />
  );
}
