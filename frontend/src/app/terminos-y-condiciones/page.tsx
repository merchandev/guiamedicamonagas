import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_EFFECTIVE_DATE_LABEL, TERMS_VERSION } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description:
    'Condiciones de uso de Guía Médica Monagas: verificación gratuita de profesionales y organizaciones, requisitos documentales, planes, pagos y privacidad.',
};

const SECTIONS = [
  { id: 'naturaleza', title: '1. Naturaleza del servicio' },
  { id: 'cuentas', title: '2. Cuentas de usuario' },
  { id: 'verificacion', title: '3. Verificación de profesionales' },
  { id: 'documentos', title: '4. Requisitos documentales' },
  { id: 'organizaciones', title: '5. Farmacias, laboratorios y clínicas' },
  { id: 'planes', title: '6. Planes, visibilidad y pagos' },
  { id: 'pacientes', title: '7. Datos de los pacientes' },
  { id: 'suspension', title: '8. Suspensión y baja' },
  { id: 'contenido', title: '9. Contenido y conducta' },
  { id: 'responsabilidad', title: '10. Límite de responsabilidad' },
  { id: 'cambios', title: '11. Cambios y versiones' },
];

const LAW = 'Requisito legal (Ley de Ejercicio de la Medicina)';
const QUALIFICATION = 'Habilitación profesional';
const PLATFORM = 'Política de verificación de Guía Médica Monagas';

// En el orden en que un médico los obtiene en Venezuela (mismo orden que el panel del médico).
const REQUIREMENTS: { item: string; nature: string }[] = [
  { item: 'Cédula de identidad vigente.', nature: `Identidad · ${PLATFORM}` },
  { item: 'RIF actualizado.', nature: `Fiscal · ${PLATFORM}` },
  { item: 'Título de Médico Cirujano, registrado ante el Registro Principal.', nature: LAW },
  { item: 'Registro del título ante el Ministerio del Poder Popular para la Salud (MPPS / SACS).', nature: QUALIFICATION },
  {
    item: 'Inscripción en el Colegio de Médicos (u organización médico-gremial) del estado donde ejerce.',
    nature: QUALIFICATION,
  },
  { item: 'Constancia de cumplimiento del Artículo 8 (servicio rural o internado rotatorio).', nature: LAW },
];

const SPECIALIST_REQUIREMENTS = ['Título de postgrado o especialización.', 'Credencial de reconocimiento de la especialidad.'];

export default function TermsPage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl">Términos y condiciones</h1>
      <p className="mt-2 text-sm text-ink-500">
        Versión {TERMS_VERSION} — vigente desde el {LEGAL_EFFECTIVE_DATE_LABEL}.
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

      <article className="prose-content mt-8 space-y-8 text-ink-700">
        <section id="naturaleza">
          <h2 className="text-xl font-semibold text-ink-900">1. Naturaleza del servicio</h2>
          <p className="mt-2">
            Guía Médica Monagas es una plataforma tecnológica que ofrece un directorio de profesionales de la salud,
            farmacias, laboratorios y clínicas verificados, agenda de citas y un perfil del paciente. La plataforma{' '}
            <strong>no presta servicios médicos</strong>, no emite diagnósticos, no es una historia clínica electrónica ni
            sustituye el criterio de ningún profesional. El acto médico y sus consecuencias son responsabilidad exclusiva del
            profesional que lo realiza.
          </p>
        </section>

        <section id="cuentas">
          <h2 className="text-xl font-semibold text-ink-900">2. Cuentas de usuario</h2>
          <p className="mt-2">
            Puedes crear una cuenta como paciente, como profesional de la salud o como organización. Los datos que
            registres deben ser reales y vigentes; la cuenta es personal e intransferible. Cada paciente puede tener una sola
            cuenta (una cédula y un teléfono). Eres responsable de la confidencialidad de tu contraseña.
          </p>
        </section>

        <section id="verificacion">
          <h2 className="text-xl font-semibold text-ink-900">3. Verificación de profesionales</h2>
          <p className="mt-2">
            Ningún perfil profesional se publica automáticamente: cada documento lo revisa manualmente un administrador.
            La verificación es <strong>gratuita y la misma para todos</strong>: no depende del plan contratado, y un plan
            pago nunca sustituye ni acelera la verificación. La insignia de verificado indica que confirmamos las
            credenciales del profesional; su color (gris, azul o dorado) solo refleja el nivel de perfil elegido.
          </p>
          <p className="mt-2">
            Un perfil aparece en el directorio público cuando un administrador aprobó al menos el{' '}
            <strong>60% de sus documentos requeridos</strong> y el profesional cargó su biografía y su foto de perfil.
            Mientras no tenga el 100% aprobado, se muestra como <strong>«verificación en curso»</strong>, sin la insignia
            de verificado. Si no cumple esos requisitos, no aparece en el directorio.
          </p>
        </section>

        <section id="documentos">
          <h2 className="text-xl font-semibold text-ink-900">4. Requisitos documentales</h2>
          <p className="mt-2">
            Para verificar a un médico solicitamos los siguientes documentos, en el orden en que se obtienen. Indicamos la
            naturaleza de cada uno para distinguir lo que exige la ley de lo que es habilitación profesional o política
            interna de la plataforma:
          </p>
          <ol className="mt-4 list-decimal space-y-2 rounded-lg border border-ink-100 p-4 pl-9">
            {REQUIREMENTS.map((requirement) => (
              <li key={requirement.item}>
                {requirement.item}
                <span className="block text-sm text-ink-500">{requirement.nature}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-ink-100 p-4">
            <h3 className="font-semibold text-ink-800">Especialidad</h3>
            <p className="mt-1 text-sm text-ink-500">Solo si el profesional se anuncia como especialista, además:</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5" start={REQUIREMENTS.length + 1}>
              {SPECIALIST_REQUIREMENTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <p className="mt-4 text-sm text-ink-500">
            Opcional: el registro INPREMÉDICO u otros registros históricos; no son requisito para publicarse.
          </p>
          <p className="mt-4">
            El perfil público de cada médico muestra sus números de registro (MPPS y Colegio de Médicos) como práctica de
            transparencia. Un profesional puede registrar matrículas de Colegios de distintos estados.
          </p>
        </section>

        <section id="organizaciones">
          <h2 className="text-xl font-semibold text-ink-900">5. Farmacias, laboratorios y clínicas</h2>
          <p className="mt-2">
            Las organizaciones pueden registrarse y administrar su perfil (sedes, servicios, aseguradoras, métodos de pago y
            horario). Se publican después de que un administrador verifique sus datos, y vuelven a revisión si cambian su
            nombre, tipo o RIF. Un médico solo aparece asociado a una organización si acepta la invitación.
          </p>
        </section>

        <section id="planes">
          <h2 className="text-xl font-semibold text-ink-900">6. Planes, visibilidad y pagos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>La verificación y el perfil básico son gratuitos.</strong> Los planes pagos añaden herramientas
              (agenda, fotos, publicaciones, estadísticas, sedes, redes) y visibilidad.
            </li>
            <li>
              Los planes <strong>Profesional Plus y Premium</strong> solo se contratan con el 100% de los documentos
              requeridos aprobados.
            </li>
            <li>
              El orden del directorio prioriza perfiles completos y relevantes. Un plan pago suma un impulso acotado y, en el
              plan Premium, un espacio rotativo señalado como <strong>«Destacado»</strong>: es publicidad, no una
              recomendación clínica.
            </li>
            <li>
              Los precios se expresan en dólares y se pagan en bolívares por <strong>Pago Móvil</strong>, a la tasa oficial
              del BCV vigente al momento de suscribirse; ese monto queda fijado en la cuota junto con la tasa aplicada.
            </li>
            <li>
              El titular reporta el pago (banco, teléfono, referencia, monto y comprobante) y un administrador lo valida antes
              de activar el plan. Una misma referencia no puede usarse dos veces.
            </li>
            <li>
              Si un plan pago vence sin renovarse, el perfil vuelve al plan básico gratuito: sigue verificado y visible.
            </li>
          </ul>
        </section>

        <section id="pacientes">
          <h2 className="text-xl font-semibold text-ink-900">7. Datos de los pacientes</h2>
          <p className="mt-2">
            Los profesionales solo pueden ver datos de un paciente con su autorización vigente y únicamente para la atención
            de ese paciente. Está prohibido copiar, divulgar o usar esos datos con otros fines; cada consulta queda
            registrada. El tratamiento de datos se describe en la{' '}
            <Link href="/privacidad" className="text-pine-700 underline">
              Política de privacidad
            </Link>
            .
          </p>
        </section>

        <section id="suspension">
          <h2 className="text-xl font-semibold text-ink-900">8. Suspensión y baja</h2>
          <p className="mt-2">
            Podemos suspender o dar de baja un perfil si se detecta información falsa o documentos adulterados, si el
            Colegio de Médicos informa una suspensión o sanción, si un documento de vigencia periódica vence sin renovarse,
            si se hace un uso indebido de datos de pacientes, o si se incumplen estos términos. La decisión se notifica al
            titular.
          </p>
        </section>

        <section id="contenido">
          <h2 className="text-xl font-semibold text-ink-900">9. Contenido y conducta</h2>
          <p className="mt-2">
            No está permitido publicar información falsa, suplantar a otra persona o institución, anunciarse como
            especialista sin la credencial correspondiente, ni enviar spam o contenido ofensivo por los formularios.
          </p>
        </section>

        <section id="responsabilidad">
          <h2 className="text-xl font-semibold text-ink-900">10. Límite de responsabilidad</h2>
          <p className="mt-2">
            Realizamos una verificación documental razonable, pero no garantizamos de forma absoluta la vigencia continua de
            cada aval ni sustituimos la verificación oficial ante los organismos correspondientes (MPPS, Colegios de
            Médicos). Ante cualquier duda sobre la habilitación de un profesional, consulta directamente con esos
            organismos.
          </p>
        </section>

        <section id="cambios">
          <h2 className="text-xl font-semibold text-ink-900">11. Cambios y versiones</h2>
          <p className="mt-2">
            Cada versión de estos términos lleva número y fecha. Si los modificamos, publicaremos la nueva versión y te
            pediremos aceptarla al iniciar sesión; registramos qué versión aceptó cada usuario y cuándo.
          </p>
        </section>
      </article>
    </div>
  );
}
