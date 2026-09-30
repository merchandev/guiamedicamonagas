import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';
import { DATA_COMMITMENTS, DATA_CONTROLLER } from '@/lib/legal';

export const metadata = legalMetadata('privacidad');

const SECTIONS: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Quién trata tus datos',
    body: (
      <>
        <P>
          El responsable del tratamiento es el operador de Guía Médica Monagas, identificado en el{' '}
          <DocLink to="aviso-legal" />.
          {DATA_CONTROLLER.legalName ? (
            <>
              {' '}
              Responsable: <strong>{DATA_CONTROLLER.legalName}</strong>
              {DATA_CONTROLLER.rif ? `, RIF ${DATA_CONTROLLER.rif}` : ''}
              {DATA_CONTROLLER.address ? `, con domicilio en ${DATA_CONTROLLER.address}` : ''}.
            </>
          ) : null}
        </P>
        <P>
          Para cualquier asunto de privacidad puedes usar el{' '}
          <Link href="/reclamos?tipo=PRIVACY_RIGHTS" className="text-pine-700 underline">
            canal de solicitudes
          </Link>
          {DATA_CONTROLLER.privacyEmail ? <> o escribir a {DATA_CONTROLLER.privacyEmail}</> : null}.
        </P>
      </>
    ),
  },
  {
    id: 'marco',
    title: 'Marco legal',
    body: (
      <P>
        Tratamos tus datos conforme a la Constitución de la República Bolivariana de Venezuela —en particular el derecho
        de toda persona a acceder a sus datos, conocer su uso y pedir su actualización, rectificación o destrucción
        (artículo 28) y la protección de la vida privada, la intimidad, la propia imagen y la confidencialidad (artículo
        60)—, a la Ley Especial contra los Delitos Informáticos y a las normas sobre secreto médico de la Ley de Ejercicio
        de la Medicina y del Código de Deontología Médica.
      </P>
    ),
  },
  {
    id: 'datos',
    title: 'Datos que tratamos',
    body: (
      <>
        <h3 className="mt-4 font-semibold text-ink-900">Si eres paciente</h3>
        <Ul
          items={[
            <>
              <strong>Cuenta:</strong> correo electrónico y contraseña. La contraseña no se guarda: solo un resumen
              irreversible que no permite recuperarla.
            </>,
            <>
              <strong>Identidad y contacto:</strong> nombre, apellido, cédula, teléfono, municipio, foto de perfil y foto
              de un documento de identidad.
            </>,
            <>
              <strong>Información de salud que tú registras:</strong> fecha de nacimiento, sexo, grupo sanguíneo,
              alergias, resumen de tu condición, medicamentos y su horario, médicos tratantes, y dirección y teléfono para
              emergencias. Ver la política de <DocLink to="datos-de-salud" />.
            </>,
            <>
              <strong>Citas:</strong> médico, fecha, hora, sede, estado y el motivo de consulta que escribas.
            </>,
            <>
              <strong>Autorizaciones:</strong> a qué médico autorizaste, con qué alcance, desde cuándo y hasta cuándo, y
              si la revocaste.
            </>,
            <>
              <strong>Historial de accesos:</strong> quién consultó tus datos, cuándo y con qué alcance.
            </>,
          ]}
        />
        <h3 className="mt-4 font-semibold text-ink-900">Si eres profesional</h3>
        <Ul
          items={[
            <>
              <strong>Identidad y habilitación:</strong> nombre, cédula, RIF, números de registro (MPPS, Colegio de
              Médicos) y los documentos de verificación (título, constancias, credenciales de especialidad).
            </>,
            <>
              <strong>Información pública del perfil:</strong> nombre, foto, biografía, especialidades, datos de contacto
              y de consulta, sedes, redes sociales, publicaciones y, según el plan, un video de presentación.
            </>,
            <>
              <strong>Plan y pagos:</strong> plan contratado, y los datos de cada pago reportado (banco, teléfono emisor,
              referencia, monto, comprobante y tasa de cambio aplicada).
            </>,
            <>
              <strong>Agenda y registros propios:</strong> horarios, citas y las notas que el profesional lleve sobre su
              consulta.
            </>,
          ]}
        />
        <h3 className="mt-4 font-semibold text-ink-900">De cualquier persona que usa el sitio</h3>
        <Ul
          items={[
            <>
              <strong>Mensajes</strong> enviados a un profesional por el formulario de su perfil, y las solicitudes
              presentadas por el canal de reclamos.
            </>,
            <>
              <strong>Datos técnicos de seguridad:</strong> dirección IP y navegador asociados al inicio de sesión y a las
              acciones sensibles, para prevenir fraudes y accesos no autorizados.
            </>,
            <>
              <strong>Aceptaciones y preferencias:</strong> qué textos legales aceptaste, en qué versión y cuándo, y tu
              elección sobre cookies.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para qué los usamos',
    body: (
      <Ul
        items={[
          'Crear y administrar tu cuenta, y evitar cuentas duplicadas.',
          'Operar las funciones que tú solicitas: tu perfil, tus citas, tu código de paciente y tus autorizaciones.',
          'Permitir que los médicos que tú autorices vean los datos que tú elijas, por el tiempo que tú elijas.',
          'Verificar la identidad y la habilitación de los profesionales antes de publicarlos.',
          'Gestionar los planes de los profesionales y validar sus pagos.',
          'Enviarte avisos sobre tu cuenta, tus citas y tus solicitudes.',
          'Proteger la seguridad de las cuentas y del sistema: prevenir fraude, abuso, suplantación y accesos indebidos.',
          'Prestar soporte, atender reclamos e investigar incidentes.',
          'Llevar registros de auditoría y conservar evidencia de los consentimientos.',
          'Mejorar técnicamente el software y su confiabilidad, con datos mínimos y agregados.',
          'Cumplir obligaciones legales válidamente exigibles.',
        ]}
      />
    ),
  },
  {
    id: 'finalidad',
    title: 'Principio de finalidad',
    body: (
      <P>
        No usamos tu información para fines incompatibles con los informados en esta política. Si en el futuro una función
        nueva requiere un uso distinto, se te informará antes y, cuando corresponda, se pedirá tu consentimiento por
        separado.
      </P>
    ),
  },
  {
    id: 'compromisos',
    title: 'Lo que no hacemos con tus datos',
    body: (
      <>
        <Ul items={DATA_COMMITMENTS} />
        <P>
          Una futura integración de inteligencia artificial tendría que respetar estos compromisos y pasar antes por una
          revisión legal y técnica.
        </P>
      </>
    ),
  },
  {
    id: 'acceso',
    title: 'Quién puede acceder a tus datos',
    body: (
      <Ul
        items={[
          <>
            <strong>Tú</strong>, desde tu cuenta.
          </>,
          <>
            <strong>Los médicos que autorices</strong>, solo con el alcance y por el tiempo de tu autorización. Sin ella,
            en su agenda un médico ve únicamente tu código de paciente. Ver <DocLink to="autorizacion-medica" />.
          </>,
          <>
            <strong>Personal administrativo</strong> con permisos específicos por función y con registro de sus acciones:
            revisa documentos de profesionales y pagos, y verifica la identidad de los pacientes. El personal
            administrativo no tiene acceso a los datos de salud de los pacientes a través de la plataforma.
          </>,
          <>
            <strong>Proveedores técnicos</strong> que intervienen en la operación, en los términos de la política de{' '}
            <DocLink to="proveedores" />.
          </>,
          <>
            <strong>Autoridades competentes</strong>, solo cuando exista un fundamento jurídico válido (sección 13).
          </>,
        ]}
      />
    ),
  },
  {
    id: 'publico',
    title: 'Qué es público y qué no',
    body: (
      <>
        <P>
          <strong>Los pacientes no tienen páginas públicas.</strong> Su cédula, teléfono, dirección, fecha de nacimiento,
          documentos, alergias, medicamentos, condiciones, contactos de emergencia, citas, códigos y registros de acceso
          nunca se publican ni se ofrecen a los buscadores.
        </P>
        <P>
          De los profesionales solo se publican los campos del perfil previstos como públicos. Sus documentos de
          verificación, su cédula y su RIF son siempre privados.
        </P>
      </>
    ),
  },
  {
    id: 'analitica',
    title: 'Analítica y cookies',
    body: (
      <P>
        Las estadísticas de uso (por ejemplo, visitas a un perfil o clics en el botón de contacto) se registran solo si
        aceptas la analítica y, aun así, como conteos sin tu dirección IP ni tu navegador. No hay cookies publicitarias. El
        detalle está en la <DocLink to="cookies" />.
      </P>
    ),
  },
  {
    id: 'seguridad',
    title: 'Cómo los protegemos',
    body: (
      <>
        <Ul
          items={[
            'Las conexiones con el sitio viajan cifradas.',
            'Los datos más sensibles (cédula, teléfono, información de salud y motivos de consulta) se cifran antes de guardarse, con claves que se custodian separadas de la base de datos.',
            'Documentos, fotos y comprobantes se guardan en almacenamiento privado y solo se abren con enlaces temporales.',
            'Los archivos que se suben se revisan antes de aceptarse y a las imágenes se les eliminan los metadatos, incluida la ubicación.',
            'Los permisos administrativos se asignan por función y las acciones sensibles quedan en un registro de auditoría.',
            'Las sesiones pueden cerrarse a distancia y hay límites de intentos para frenar ataques automatizados.',
            'Las copias de seguridad se guardan cifradas.',
          ]}
        />
        <P>
          No publicamos detalles que ayudarían a atacar el sistema. Más información en <DocLink to="seguridad" />.
        </P>
      </>
    ),
  },
  {
    id: 'conservacion',
    title: 'Cuánto tiempo los conservamos',
    body: (
      <P>
        Conservamos los datos mientras tu cuenta esté activa y, después, solo lo que sea necesario por obligación legal o
        como evidencia. El criterio para cada tipo de dato está en la política de <DocLink to="retencion" />.
      </P>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    body: (
      <>
        <P>Tienes derecho a:</P>
        <Ul
          items={[
            'acceder a los datos que tenemos sobre ti y conocer para qué se usan;',
            'actualizarlos y corregirlos;',
            'obtener una copia;',
            'revocar las autorizaciones dadas a un médico;',
            'consultar quién accedió a tu información;',
            'solicitar su eliminación cuando corresponda;',
            'reclamar por un acceso indebido.',
          ]}
        />
        <P>
          Cómo ejercer cada uno, con las funciones reales de la plataforma, está en el <DocLink to="derechos" />.
        </P>
      </>
    ),
  },
  {
    id: 'autoridades',
    title: 'Requerimientos de autoridades',
    body: (
      <P>
        Solo entregamos información a una autoridad cuando existe un fundamento jurídico válido y el requerimiento proviene
        de un órgano competente. Entregamos lo estrictamente requerido y dejamos constancia. Los requerimientos se reciben
        por el{' '}
        <Link href="/reclamos?tipo=AUTHORITY_REQUEST" className="text-pine-700 underline">
          canal de solicitudes legales
        </Link>
        .
      </P>
    ),
  },
  {
    id: 'incidentes',
    title: 'Incidentes de seguridad',
    body: (
      <P>
        Si detectamos un incidente que afecte tus datos personales, lo investigaremos, tomaremos medidas para contenerlo y
        avisaremos a las personas afectadas cuando exista un riesgo para ellas, indicando qué ocurrió y qué pueden hacer.
      </P>
    ),
  },
  {
    id: 'menores',
    title: 'Menores de edad',
    body: (
      <P>
        El registro de pacientes es solo para personas de 18 años o más. Ver la política de <DocLink to="menores" />.
      </P>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a esta política',
    body: (
      <P>
        Cada versión lleva número y fecha. Si la modificamos de forma sustancial, publicaremos la nueva versión aquí y te
        pediremos aceptarla al iniciar sesión; registramos qué versión aceptó cada usuario.
      </P>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      slug="privacidad"
      lead={
        <Callout title="En pocas palabras">
          Usamos tus datos solo para operar y proteger la plataforma. No los vendemos, no los usamos para publicidad ni
          para estudiar hábitos de consumo, y no entrenamos inteligencia artificial con tu información privada. Tus datos
          de salud no son públicos y ningún médico los ve sin tu autorización.
        </Callout>
      }
      sections={SECTIONS}
      related={['datos-de-salud', 'consentimiento-paciente', 'autorizacion-medica', 'derechos', 'retencion', 'proveedores', 'cookies', 'menores']}
    />
  );
}
