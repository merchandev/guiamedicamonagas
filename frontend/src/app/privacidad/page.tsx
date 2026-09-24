import type { Metadata } from 'next';
import Link from 'next/link';
import { DATA_CONTROLLER, LEGAL_EFFECTIVE_DATE_LABEL, PATIENT_CONSENT_VERSION, PRIVACY_VERSION } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Qué datos trata Guía Médica Monagas, incluidos los datos de salud de los pacientes, cómo se protegen, cuánto tiempo se conservan y cómo ejercer tus derechos.',
};

const SECTIONS = [
  { id: 'responsable', title: '1. Quién trata tus datos' },
  { id: 'datos', title: '2. Datos que tratamos' },
  { id: 'salud', title: '3. Datos de salud del paciente' },
  { id: 'finalidades', title: '4. Para qué los usamos' },
  { id: 'medicos', title: '5. Acceso de los médicos a tus datos' },
  { id: 'terceros', title: '6. Con quién los compartimos' },
  { id: 'seguridad', title: '7. Cómo los protegemos' },
  { id: 'conservacion', title: '8. Cuánto tiempo los conservamos' },
  { id: 'cookies', title: '9. Cookies y analítica' },
  { id: 'derechos', title: '10. Tus derechos' },
  { id: 'cambios', title: '11. Cambios a esta política' },
];

export default function PrivacyPage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl">Política de privacidad</h1>
      <p className="mt-2 text-sm text-ink-500">
        Versión {PRIVACY_VERSION} — vigente desde el {LEGAL_EFFECTIVE_DATE_LABEL}. Cuando cambie, publicaremos la nueva
        versión con su fecha y te pediremos aceptarla de nuevo al iniciar sesión.
      </p>

      <nav className="card mt-6 p-5 text-sm">
        <p className="mb-2 font-semibold text-ink-900">Contenido</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-pine-700 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="mt-8 space-y-8 text-ink-700">
        <section id="responsable">
          <h2 className="text-xl font-semibold text-ink-900">1. Quién trata tus datos</h2>
          <p className="mt-2">
            Guía Médica Monagas opera esta plataforma de directorio de profesionales y organizaciones de salud verificados,
            agenda de citas y perfil del paciente. Tratamos tus datos conforme a la Constitución de la República
            Bolivariana de Venezuela (en particular el derecho a la protección de la vida privada y el acceso a la
            información sobre uno mismo, artículos 28 y 60) y a la normativa venezolana aplicable al secreto y la
            confidencialidad de la información médica.
          </p>
          {DATA_CONTROLLER.legalName && (
            <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
              <dt className="font-medium text-ink-900">Responsable</dt>
              <dd>{DATA_CONTROLLER.legalName}</dd>
              {DATA_CONTROLLER.rif && (
                <>
                  <dt className="font-medium text-ink-900">RIF</dt>
                  <dd>{DATA_CONTROLLER.rif}</dd>
                </>
              )}
              {DATA_CONTROLLER.address && (
                <>
                  <dt className="font-medium text-ink-900">Domicilio</dt>
                  <dd>{DATA_CONTROLLER.address}</dd>
                </>
              )}
              {DATA_CONTROLLER.privacyEmail && (
                <>
                  <dt className="font-medium text-ink-900">Privacidad</dt>
                  <dd>{DATA_CONTROLLER.privacyEmail}</dd>
                </>
              )}
              {DATA_CONTROLLER.supportEmail && (
                <>
                  <dt className="font-medium text-ink-900">Soporte</dt>
                  <dd>{DATA_CONTROLLER.supportEmail}</dd>
                </>
              )}
            </dl>
          )}
        </section>

        <section id="datos">
          <h2 className="text-xl font-semibold text-ink-900">2. Datos que tratamos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Cuenta:</strong> correo electrónico y contraseña. La contraseña nunca se guarda: se almacena solo un
              resumen criptográfico irreversible (Argon2id), que no permite recuperarla.
            </li>
            <li>
              <strong>Perfil del paciente:</strong> nombre, apellido, cédula, teléfono, municipio, foto de perfil y foto de
              un documento de identidad, además de los datos de salud descritos en la sección 3.
            </li>
            <li>
              <strong>Citas:</strong> médico, fecha, hora, sede, estado y el motivo de consulta que escribas.
            </li>
            <li>
              <strong>Perfil profesional:</strong> nombre, biografía, especialidades, datos de contacto y de consulta,
              números de registro (MPPS, Colegio de Médicos) y los documentos de verificación (título, constancias,
              solvencia, cédula y RIF).
            </li>
            <li>
              <strong>Organizaciones</strong> (farmacias, laboratorios y clínicas): datos de la entidad, RIF, sedes,
              servicios y las cuentas de las personas que la administran.
            </li>
            <li>
              <strong>Pagos:</strong> datos del reporte de Pago Móvil (banco, teléfono emisor, referencia, monto y
              comprobante) y la tasa de cambio aplicada.
            </li>
            <li>
              <strong>Mensajes</strong> enviados a un profesional por el formulario de su perfil.
            </li>
            <li>
              <strong>Datos técnicos de seguridad:</strong> dirección IP y navegador asociados a tu inicio de sesión y a
              las acciones sensibles, para prevenir fraudes y accesos no autorizados.
            </li>
            <li>
              <strong>Preferencias de cookies</strong> que elijas, como evidencia de tu consentimiento.
            </li>
          </ul>
        </section>

        <section id="salud">
          <h2 className="text-xl font-semibold text-ink-900">3. Datos de salud del paciente</h2>
          <p className="mt-2">
            Si eres paciente, puedes registrar voluntariamente en tu perfil: fecha de nacimiento, sexo, grupo sanguíneo,
            alergias, un resumen de tu condición de salud (o indicar que eres una persona sana), medicamentos y su horario,
            médicos tratantes, dirección y número de contacto para emergencias. También el motivo de consulta de tus
            citas.
          </p>
          <p className="mt-2">
            Estos datos son de categoría especialmente sensible. Por eso: se guardan <strong>cifrados</strong> (ver
            sección 7), solo se usan para las finalidades de la sección 4, <strong>no se venden ni se usan con fines
            publicitarios</strong>, y ningún médico ni organización los ve sin tu autorización (sección 5).
          </p>
          <p className="mt-2">
            La plataforma no es una historia clínica electrónica: no sustituye el registro clínico que cada profesional
            lleva bajo su responsabilidad.
          </p>
        </section>

        <section id="finalidades">
          <h2 className="text-xl font-semibold text-ink-900">4. Para qué los usamos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Crear y proteger tu cuenta, y evitar cuentas duplicadas (una cédula y un teléfono por paciente).</li>
            <li>Gestionar tus citas y enviarte confirmaciones, recordatorios y avisos por correo y, cuando esté activo, WhatsApp.</li>
            <li>Permitir que los médicos que TÚ autorices vean los datos que TÚ elijas.</li>
            <li>Verificar la identidad y habilitación de profesionales y organizaciones antes de publicarlos.</li>
            <li>Procesar y validar los pagos de los planes.</li>
            <li>Estadísticas agregadas y anónimas de uso del directorio (solo si aceptas la analítica; ver sección 9).</li>
            <li>Cumplir obligaciones legales y atender requerimientos de autoridades competentes.</li>
          </ul>
        </section>

        <section id="medicos">
          <h2 className="text-xl font-semibold text-ink-900">5. Acceso de los médicos a tus datos</h2>
          <p className="mt-2">
            En su agenda, un médico solo ve un <strong>código de paciente</strong> (por ejemplo, GMM-A4F2), nunca tu
            nombre, cédula ni datos de salud. Para ver más debe contar con tu <strong>autorización explícita</strong>{' '}
            (texto de consentimiento v{PATIENT_CONSENT_VERSION}), que tú otorgas:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Eligiendo el alcance: nombre, datos de contacto y emergencia, y/o datos de salud.</li>
            <li>Eligiendo por cuánto tiempo (por ejemplo, 30 días).</li>
            <li>Pudiendo revocarla en cualquier momento desde tu panel, con efecto inmediato.</li>
          </ul>
          <p className="mt-2">
            Cada vez que un médico consulta tus datos, el acceso queda registrado (quién, cuándo y qué alcance). Tu cédula
            no se comparte con los médicos a través de la plataforma. Si un médico registra una cita a tu nombre sin que
            tengas cuenta, solo ese médico ve los datos que él mismo cargó.
          </p>
        </section>

        <section id="terceros">
          <h2 className="text-xl font-semibold text-ink-900">6. Con quién los compartimos</h2>
          <p className="mt-2">No vendemos datos personales. Solo intervienen:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Los médicos que autorices, en los términos de la sección 5.</li>
            <li>
              Personal administrativo de Guía Médica Monagas con permisos específicos y registrados: la verificación de
              documentos profesionales y de pagos. El personal administrativo no tiene acceso a los datos de salud de los
              pacientes a través de la plataforma.
            </li>
            <li>
              Proveedores técnicos que procesan datos por cuenta nuestra y bajo confidencialidad: alojamiento del servidor,
              envío de correo electrónico y, cuando esté activo, la mensajería de WhatsApp Business de Meta.
            </li>
            <li>Autoridades competentes, cuando la ley lo exija.</li>
          </ul>
        </section>

        <section id="seguridad">
          <h2 className="text-xl font-semibold text-ink-900">7. Cómo los protegemos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Cédula, teléfono, datos de salud y motivos de consulta se cifran en la aplicación (AES-256-GCM) con claves que
              se guardan fuera de la base de datos: un respaldo de la base de datos por sí solo no permite leerlos.
            </li>
            <li>Contraseñas con Argon2id, bloqueo tras intentos fallidos y sesiones revocables.</li>
            <li>Documentos, fotos y comprobantes en almacenamiento privado, accesibles solo con enlaces temporales.</li>
            <li>
              Todo archivo subido se verifica por su contenido real; las imágenes se regeneran y se les eliminan los
              metadatos (incluida la ubicación GPS).
            </li>
            <li>Permisos administrativos por función y registro de auditoría de las acciones sensibles.</li>
          </ul>
        </section>

        <section id="conservacion">
          <h2 className="text-xl font-semibold text-ink-900">8. Cuánto tiempo los conservamos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Datos de cuenta y perfil: mientras la cuenta esté activa, o hasta que solicites su eliminación.</li>
            <li>Autorizaciones a médicos: se conservan como evidencia aun después de vencer o ser revocadas.</li>
            <li>
              Pagos y comprobantes: el tiempo que exija la normativa tributaria y mercantil venezolana.
            </li>
            <li>
              Registros de auditoría y de consentimiento: mientras sean necesarios para demostrar el cumplimiento de esta
              política o atender reclamaciones.
            </li>
          </ul>
        </section>

        <section id="cookies">
          <h2 className="text-xl font-semibold text-ink-900">9. Cookies y analítica</h2>
          <p className="mt-2">
            Usamos cookies necesarias para la sesión y la seguridad. Las estadísticas de uso (visitas a un perfil, clics en
            WhatsApp o teléfono) se registran <strong>solo si aceptas la analítica</strong> y, aun así, como conteos
            anónimos: sin tu dirección IP ni tu navegador. Puedes cambiar tu elección en cualquier momento desde
            «Configuración de cookies» en el pie de página.
          </p>
        </section>

        <section id="derechos">
          <h2 className="text-xl font-semibold text-ink-900">10. Tus derechos</h2>
          <p className="mt-2">
            Puedes acceder a tus datos y corregirlos desde tu panel, revocar autorizaciones a médicos en cualquier momento,
            y solicitar una copia o la eliminación de tu información escribiéndonos por los canales de contacto del sitio.
            Algunos registros (pagos, auditoría) pueden conservarse el tiempo indicado en la sección 8 por obligación legal.
          </p>
        </section>

        <section id="cambios">
          <h2 className="text-xl font-semibold text-ink-900">11. Cambios a esta política</h2>
          <p className="mt-2">
            Cada versión lleva número y fecha. Si la modificamos, publicaremos la nueva versión aquí y te pediremos
            aceptarla al iniciar sesión; registramos qué versión aceptó cada usuario. Consulta también los{' '}
            <Link href="/terminos-y-condiciones" className="text-pine-700 underline">
              Términos y condiciones
            </Link>
            .
          </p>
        </section>
      </article>
    </div>
  );
}
