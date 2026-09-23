import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description: 'Condiciones de uso de Guía Médica Monagas, incluyendo los requisitos legales de verificación para médicos.',
};

const SECTIONS = [
  { id: 'naturaleza', title: '1. Naturaleza del servicio' },
  { id: 'cuentas', title: '2. Cuentas de usuario' },
  { id: 'verificacion', title: '3. Verificación de profesionales de la salud' },
  { id: 'documentos', title: '4. Documentos exigidos' },
  { id: 'suspension', title: '5. Suspensión y baja del directorio' },
  { id: 'pagos', title: '6. Suscripción y pagos por Pago Móvil' },
  { id: 'contenido', title: '7. Contenido y conducta del usuario' },
  { id: 'responsabilidad', title: '8. Límite de responsabilidad' },
  { id: 'privacidad', title: '9. Privacidad y datos personales' },
  { id: 'cambios', title: '10. Cambios en estos términos' },
  { id: 'contacto', title: '11. Contacto' },
];

export default function TermsPage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl">Términos y condiciones</h1>
      <p className="mt-2 text-sm text-ink-500">Última actualización: {new Date().toLocaleDateString('es-VE')}</p>

      <nav className="card mt-6 p-5 text-sm">
        <p className="mb-2 font-semibold text-ink-900">Contenido</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-pine-700 hover:underline">{s.title}</a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="prose-content mt-8 space-y-8 text-ink-700">
        <section id="naturaleza">
          <h2 className="text-xl font-semibold text-ink-900">1. Naturaleza del servicio</h2>
          <p className="mt-2">
            Guía Médica Monagas es una plataforma tecnológica que ofrece un directorio de profesionales de la salud,
            farmacias, laboratorios y clínicas en el estado Monagas, Venezuela. La plataforma <strong>no presta
            servicios médicos</strong>, no emite diagnósticos ni sustituye el criterio profesional de ningún médico.
            El acto médico, sus indicaciones y sus consecuencias son responsabilidad exclusiva del profesional de la
            salud que lo realiza.
          </p>
        </section>

        <section id="cuentas">
          <h2 className="text-xl font-semibold text-ink-900">2. Cuentas de usuario</h2>
          <p className="mt-2">
            Puedes crear una cuenta como paciente/usuario o como profesional de la salud. Los datos que registres
            deben ser reales, exactos y estar vigentes. La cuenta es personal e intransferible. Eres responsable de
            mantener la confidencialidad de tu contraseña y de toda actividad realizada desde tu cuenta.
          </p>
        </section>

        <section id="verificacion">
          <h2 className="text-xl font-semibold text-ink-900">3. Verificación de profesionales de la salud</h2>
          <p className="mt-2">
            Para garantizar que los médicos de la plataforma estén legalmente habilitados para ejercer la medicina en
            el estado Monagas, exigimos documentos que avalen su formación académica, el cumplimiento de la Ley de
            Ejercicio de la Medicina de Venezuela y su debida inscripción gremial local, de acuerdo con las
            normativas del Ministerio del Poder Popular para la Salud (MPPS). Ningún perfil profesional se publica de
            forma automática: cada documento es revisado manualmente por un administrador antes de que el perfil sea
            visible al público.
          </p>
          <p className="mt-2">
            Mientras tu perfil no esté verificado, no aparecerá en el directorio público ni podrá recibir mensajes de
            pacientes.
          </p>
        </section>

        <section id="documentos">
          <h2 className="text-xl font-semibold text-ink-900">4. Documentos exigidos</h2>

          <h3 className="mt-4 font-semibold text-ink-800">4.1 Avales gubernamentales y legales (nacional)</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Copia del <strong>Título de Médico Cirujano</strong>, con los sellos de protocolización del Registro
              Principal en su reverso.
            </li>
            <li>
              <strong>Constancia de Registro de Título ante el MPPS (SACS)</strong> — Servicio Autónomo de
              Contraloría Sanitaria, con el número de registro del Ministerio de Salud.
            </li>
            <li>
              <strong>Constancia de Cumplimiento del Artículo 8</strong> de la Ley de Ejercicio de la Medicina
              (servicio rural o internado rotatorio), emitida por el MPPS. Sin esta constancia no se puede ejercer en
              clínicas privadas ni en cargos asistenciales legalmente.
            </li>
          </ul>

          <h3 className="mt-4 font-semibold text-ink-800">4.2 Avales gremiales (específicos de Monagas)</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>N° de Matrícula del Colegio de Médicos del Estado Monagas</strong>, mostrado públicamente en el
              perfil del médico.
            </li>
            <li>
              <strong>Solvencia Deontológica vigente</strong>, emitida por el Colegio de Médicos de Monagas. Se
              solicita de forma anual para garantizar que el médico está activo y no ha sido suspendido por el
              Tribunal Disciplinario del colegio.
            </li>
          </ul>

          <h3 className="mt-4 font-semibold text-ink-800">4.3 Médicos especialistas</h3>
          <p className="mt-2">
            Si te promocionas en la guía como especialista (Pediatra, Cirujano, Cardiólogo, etc.), debes entregar
            además:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Título de Postgrado o Especialización</strong>, expedido por una universidad venezolana u hospital sede.</li>
            <li>
              <strong>Credencial de Reconocimiento de Especialidad</strong>, emitida por el Colegio de Médicos del
              Estado Monagas, que evalúa tus credenciales de postgrado y te reconoce oficialmente como especialista
              en el estado.
            </li>
          </ul>

          <h3 className="mt-4 font-semibold text-ink-800">4.4 Documentación de identidad</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Cédula de identidad laminada vigente.</li>
            <li>RIF actualizado, indispensable para verificar tu identidad fiscal, especialmente si cobras consultas privadas.</li>
          </ul>

          <p className="mt-4">
            El perfil público de cada médico muestra de forma obligatoria y visible el <strong>N° MPPS</strong> y el{' '}
            <strong>N° del Colegio de Médicos de Monagas</strong> como práctica estándar de transparencia médica en
            Venezuela.
          </p>
        </section>

        <section id="suspension">
          <h2 className="text-xl font-semibold text-ink-900">5. Suspensión y baja del directorio</h2>
          <p className="mt-2">
            Guía Médica Monagas puede suspender o dar de baja un perfil profesional si: (a) se detecta información
            falsa o documentos adulterados, (b) el Colegio de Médicos de Monagas informa una suspensión o sanción
            disciplinaria, (c) la Solvencia Deontológica vence y no se renueva, o (d) se incumplen estos términos. La
            decisión se notifica al profesional por correo y, cuando aplique, por WhatsApp.
          </p>
        </section>

        <section id="pagos">
          <h2 className="text-xl font-semibold text-ink-900">6. Suscripción y pagos por Pago Móvil</h2>
          <p className="mt-2">
            El acceso al directorio como profesional verificado requiere una suscripción de pago. El único método de
            pago disponible es <strong>Pago Móvil en bolívares</strong>. El profesional debe reportar el pago
            directamente en la plataforma (banco emisor, teléfono, referencia, monto y comprobante) y un
            administrador debe revisarlo y aprobarlo manualmente antes de activar o renovar la suscripción. Un pago
            reportado no garantiza la activación inmediata: la suscripción se activa solo tras la aprobación
            administrativa.
          </p>
        </section>

        <section id="contenido">
          <h2 className="text-xl font-semibold text-ink-900">7. Contenido y conducta del usuario</h2>
          <p className="mt-2">
            No está permitido publicar información falsa, suplantar a otro profesional, usar la plataforma para fines
            distintos a los descritos, ni enviar mensajes de spam o contenido ofensivo a través de los formularios de
            contacto.
          </p>
        </section>

        <section id="responsabilidad">
          <h2 className="text-xl font-semibold text-ink-900">8. Límite de responsabilidad</h2>
          <p className="mt-2">
            Guía Médica Monagas realiza un proceso de verificación documental razonable, pero no garantiza de forma
            absoluta la vigencia continua de cada aval ni sustituye la verificación oficial ante los organismos
            correspondientes (MPPS, Colegio de Médicos de Monagas, FMV). El uso de la información del directorio es
            responsabilidad del usuario; ante cualquier duda sobre la habilitación de un profesional, recomendamos
            verificar directamente con el Colegio de Médicos del Estado Monagas.
          </p>
        </section>

        <section id="privacidad">
          <h2 className="text-xl font-semibold text-ink-900">9. Privacidad y datos personales</h2>
          <p className="mt-2">
            El tratamiento de tus datos personales, incluidos los documentos de verificación, se describe en nuestra{' '}
            <a href="/privacidad" className="text-pine-700 underline">Política de Privacidad</a>.
          </p>
        </section>

        <section id="cambios">
          <h2 className="text-xl font-semibold text-ink-900">10. Cambios en estos términos</h2>
          <p className="mt-2">
            Podemos actualizar estos términos para reflejar cambios normativos o mejoras del servicio. Publicaremos
            la fecha de la última actualización en la parte superior de esta página.
          </p>
        </section>

        <section id="contacto">
          <h2 className="text-xl font-semibold text-ink-900">11. Contacto</h2>
          <p className="mt-2">
            Si tienes dudas sobre estos términos, escríbenos a través de los canales indicados en el pie de página del
            sitio.
          </p>
        </section>
      </article>
    </div>
  );
}
