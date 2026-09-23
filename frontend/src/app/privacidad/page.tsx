import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: 'Cómo Guía Médica Monagas recopila, usa y protege tus datos personales y documentos de verificación.',
};

export default function PrivacyPage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl">Política de privacidad</h1>
      <p className="mt-2 text-sm text-ink-500">Última actualización: {new Date().toLocaleDateString('es-VE')}</p>

      <article className="mt-8 space-y-8 text-ink-700">
        <section>
          <h2 className="text-xl font-semibold text-ink-900">1. Datos que recopilamos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Datos de cuenta: correo electrónico y contraseña (almacenada de forma cifrada, nunca en texto plano).</li>
            <li>Datos de perfil profesional: nombre, biografía, especialidades, teléfono, WhatsApp, dirección de consulta.</li>
            <li>
              Documentos de verificación: título médico, registro MPPS, matrícula del Colegio de Médicos de Monagas,
              solvencia deontológica, cédula y RIF. Estos documentos se almacenan en un espacio privado
              y solo son accesibles por el equipo administrativo encargado de la verificación.
            </li>
            <li>Comprobantes de Pago Móvil reportados para activar la suscripción.</li>
            <li>Mensajes enviados por pacientes a través del formulario de contacto de cada perfil.</li>
            <li>Datos técnicos: dirección IP, tipo de navegador y eventos de uso (clics en WhatsApp, teléfono, mapa) con fines estadísticos.</li>
            <li>Preferencias de cookies que elijas en el aviso correspondiente.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink-900">2. Para qué usamos tus datos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Verificar tu identidad y habilitación legal para ejercer la medicina en Monagas.</li>
            <li>Mostrar tu perfil profesional verificado en el directorio público.</li>
            <li>Procesar y revisar el pago de tu suscripción.</li>
            <li>Enviarte notificaciones por correo electrónico y WhatsApp sobre el estado de tus documentos, pagos y mensajes recibidos.</li>
            <li>Mejorar el servicio mediante estadísticas de uso agregadas.</li>
            <li>Cumplir obligaciones legales y responder a requerimientos de las autoridades competentes.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink-900">3. Con quién compartimos tus datos</h2>
          <p className="mt-2">
            No vendemos tus datos personales. Los documentos de verificación solo son accesibles por el equipo
            administrativo de Guía Médica Monagas. Podemos compartir información con proveedores técnicos que
            procesan datos en nuestro nombre (correo electrónico, mensajería de WhatsApp, almacenamiento de
            archivos), bajo obligaciones de confidencialidad, o cuando la ley lo exija.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink-900">4. Cookies</h2>
          <p className="mt-2">
            Usamos cookies necesarias para el funcionamiento del sitio y, con tu consentimiento explícito, cookies de
            análisis y marketing. Puedes cambiar tus preferencias en cualquier momento desde el enlace
            &quot;Configuración de cookies&quot; en el pie de página.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink-900">5. Seguridad</h2>
          <p className="mt-2">
            Aplicamos medidas técnicas razonables para proteger tus datos: contraseñas cifradas, conexiones seguras,
            acceso restringido a los documentos de verificación y comprobantes de pago, y registro de auditoría de
            las acciones administrativas sobre tu cuenta.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink-900">6. Tus derechos</h2>
          <p className="mt-2">
            Puedes solicitar acceso, corrección o eliminación de tus datos personales escribiéndonos a través de los
            canales de contacto del sitio. Ten en cuenta que, para profesionales verificados, algunos datos (como el
            registro de auditoría de la verificación) pueden conservarse por motivos de cumplimiento legal.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink-900">7. Cambios a esta política</h2>
          <p className="mt-2">
            Podemos actualizar esta política periódicamente. Publicaremos la fecha de la última actualización en la
            parte superior de esta página.
          </p>
        </section>
      </article>
    </div>
  );
}
