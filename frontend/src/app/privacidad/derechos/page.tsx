import Link from 'next/link';
import { CookiePreferencesButton } from '@/components/legal/CookiePreferencesButton';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('derechos');

function Action({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-pine-700 underline">
      {children}
    </Link>
  );
}

// Cada derecho apunta a la función real de la plataforma que lo hace efectivo.
const RIGHTS: { title: string; how: React.ReactNode }[] = [
  {
    title: 'Ver tus datos',
    how: (
      <>
        Pacientes: <Action href="/paciente">Mi perfil</Action>. Profesionales:{' '}
        <Action href="/dashboard/perfil">Mi perfil profesional</Action>.
      </>
    ),
  },
  {
    title: 'Corregirlos y actualizarlos',
    how: (
      <>
        Desde el mismo perfil. Si un dato no se puede editar allí,{' '}
        <Action href="/reclamos?tipo=PRIVACY_RIGHTS">pide la corrección</Action>.
      </>
    ),
  },
  {
    title: 'Descargar una copia',
    how: (
      <>
        Pacientes: <Action href="/paciente/privacidad">Privacidad y mis datos</Action> → «Descargar mis datos». El archivo
        incluye tu cuenta, tu perfil, tu información de salud, tus citas, tus autorizaciones, el historial de accesos y
        los textos legales que aceptaste. Otras cuentas: <Action href="/reclamos?tipo=PRIVACY_RIGHTS">solicítala</Action>.
      </>
    ),
  },
  {
    title: 'Saber quién accedió a tu información',
    how: (
      <>
        <Action href="/paciente/privacidad">Privacidad y mis datos</Action> muestra quién consultó tus datos, cuándo y con
        qué alcance.
      </>
    ),
  },
  {
    title: 'Revocar el acceso de un médico',
    how: (
      <>
        <Action href="/paciente/permisos">Permisos</Action>: la revocación es inmediata.
      </>
    ),
  },
  {
    title: 'Invalidar tu código o QR',
    how: (
      <>
        <Action href="/paciente/codigo">Mi código</Action> → «Generar uno nuevo». El anterior deja de funcionar al instante.
      </>
    ),
  },
  {
    title: 'Cerrar tu cuenta y pedir la eliminación de tus datos',
    how: (
      <>
        <Action href="/reclamos?tipo=ACCOUNT_DELETION">Solicitud de cierre y eliminación</Action>. Qué se borra y qué se
        conserva está en la política de <DocLink to="retencion" />.
      </>
    ),
  },
  {
    title: 'Denunciar un acceso indebido',
    how: <Action href="/reclamos?tipo=UNAUTHORIZED_ACCESS">Denuncia de acceso indebido</Action>,
  },
  {
    title: 'Proteger tu cuenta',
    how: (
      <>
        <Action href="/cuenta/seguridad">Seguridad de la cuenta</Action>: cambiar la contraseña y cerrar todas las
        sesiones.
      </>
    ),
  },
  {
    title: 'Contactar con privacidad',
    how: <Action href="/reclamos?tipo=PRIVACY_RIGHTS">Solicitud sobre mis datos</Action>,
  },
];

const SECTIONS: LegalSection[] = [
  {
    id: 'derechos',
    title: 'Tus derechos y cómo ejercerlos',
    body: (
      <>
        <P>
          La Constitución (artículo 28) reconoce a toda persona el derecho a acceder a los datos que sobre ella consten en
          registros públicos o privados, a conocer su uso y finalidad, y a pedir su actualización, rectificación o
          destrucción cuando corresponda. En la plataforma se ejercen así:
        </P>
        <dl className="mt-4 divide-y divide-ink-100 rounded-lg border border-ink-100">
          {RIGHTS.map((right) => (
            <div key={right.title} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="font-medium text-ink-900">{right.title}</dt>
              <dd className="text-sm">{right.how}</dd>
            </div>
          ))}
        </dl>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Tu elección sobre cookies',
    body: (
      <>
        <P>
          Puedes aceptar o rechazar la analítica en cualquier momento. Ver <DocLink to="cookies" />.
        </P>
        <div className="mt-3">
          <CookiePreferencesButton />
        </div>
      </>
    ),
  },
  {
    id: 'sin-cuenta',
    title: 'Si no tienes cuenta',
    body: (
      <P>
        También puedes ejercer estos derechos si crees que la plataforma trata datos tuyos sin que tengas cuenta —por
        ejemplo, si alguien usó tu identidad o tus credenciales—. Usa el{' '}
        <Action href="/reclamos">canal de reclamos y solicitudes</Action>; no necesitas iniciar sesión.
      </P>
    ),
  },
  {
    id: 'tramite',
    title: 'Cómo se tramita una solicitud',
    body: (
      <Ul
        items={[
          'Cada solicitud recibe un número de seguimiento con el que puedes consultar su estado.',
          'Antes de entregar o eliminar datos comprobamos que quien lo pide es el titular; podemos pedirte información adicional para ello.',
          'La respuesta queda registrada junto a la solicitud.',
          'Ejercer estos derechos no tiene costo.',
        ]}
      />
    ),
  },
  {
    id: 'limites',
    title: 'Límites',
    body: (
      <Callout>
        Algunos registros no pueden eliminarse de inmediato: los que una norma obliga a conservar (como los de pagos), la
        evidencia de consentimientos y accesos, y las copias de seguridad hasta que termina su rotación. Tampoco podemos
        modificar los registros que un médico lleva por su cuenta fuera de la plataforma. El detalle está en la política
        de <DocLink to="retencion" />.
      </Callout>
    ),
  },
];

export default function PrivacyCenterPage() {
  return (
    <LegalPage
      slug="derechos"
      lead={
        <p>
          Aquí está cada derecho sobre tus datos con el enlace a la función que lo hace efectivo. Lo que no puedas resolver
          por ti mismo, pídelo por el canal de solicitudes.
        </p>
      }
      sections={SECTIONS}
      related={['privacidad', 'datos-de-salud', 'autorizacion-medica', 'retencion', 'cookies', 'reclamos']}
    />
  );
}
