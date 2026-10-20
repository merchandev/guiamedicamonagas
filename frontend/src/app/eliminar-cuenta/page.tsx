import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Eliminar mi cuenta',
  description:
    'Cómo eliminar tu cuenta de MonagasMed, qué datos se borran, el plazo de 30 días y qué se conserva por obligación legal.',
};

export default function EliminarCuentaPage() {
  return (
    <div className="container-page max-w-2xl space-y-6 py-12">
      <h1 className="text-3xl font-semibold text-ink-950">Eliminar mi cuenta</h1>
      <p className="text-ink-700">
        Puedes pedir la eliminación de tu cuenta de MonagasMed cuando quieras. Esta página explica cómo hacerlo, qué se
        borra y qué conservamos solo cuando la ley lo exige.
      </p>

      <section className="card space-y-3 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Cómo solicitarla</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-700">
          <li>
            <strong>Desde la app:</strong> entra a <em>Cuenta → Seguridad → Eliminar mi cuenta</em>, escribe tu
            contraseña y confirma.
          </li>
          <li>
            <strong>Desde la web:</strong> en{' '}
            <Link href="/cuenta/seguridad" className="text-pine-700 hover:underline">
              Seguridad de la cuenta
            </Link>
            , usa «Eliminar mi cuenta».
          </li>
          <li>
            <strong>Sin acceso a tu cuenta:</strong> envía una solicitud en nuestro{' '}
            <Link href="/reclamos?tipo=ACCOUNT_DELETION#formulario" className="text-pine-700 hover:underline">
              formulario externo de eliminación
            </Link>{' '}
            . No necesitas iniciar sesión. Te daremos un número de seguimiento y verificaremos que eres el titular antes
            de tramitarla.
          </li>
        </ul>
      </section>

      <section className="card space-y-3 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Qué pasa al solicitarla</h2>
        <p className="text-sm text-ink-700">
          Si la solicitas desde la app o desde la web con tu sesión iniciada, cerramos tus sesiones y empieza un{' '}
          <strong>período de gracia de 30 días</strong>. Si vuelves a iniciar sesión durante ese plazo, la solicitud se
          cancela; si no, eliminamos tus datos personales al vencer. Si usas el formulario externo porque no puedes
          iniciar sesión, primero verificaremos tu identidad y te contactaremos para completar el trámite.
        </p>
      </section>

      <section className="card space-y-3 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Qué se elimina</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-700">
          <li>Tu nombre, correo, contraseña, cédula y teléfono.</li>
          <li>Tu foto de perfil y tus documentos.</li>
          <li>Tu resumen de salud y demás datos personales de tu ficha.</li>
          <li>Tus notificaciones y los tokens de notificación de tus dispositivos.</li>
        </ul>
      </section>

      <section className="card space-y-3 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Qué se conserva (por obligación legal)</h2>
        <p className="text-sm text-ink-700">
          De las cuentas de <strong>médicos</strong>, solo se conservan sus <strong>registros de pago</strong> de forma
          <strong> anonimizada</strong>, porque la normativa tributaria obliga a guardarlos; la cuenta queda como un
          registro sin datos personales. Las cuentas de <strong>pacientes</strong> se borran por completo.
        </p>
      </section>

      <p className="text-sm text-ink-500">
        Más detalles en nuestra{' '}
        <Link href="/privacidad" className="text-pine-700 hover:underline">
          Política de privacidad
        </Link>
        .
      </p>
    </div>
  );
}
