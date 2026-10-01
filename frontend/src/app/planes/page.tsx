import type { Metadata } from 'next';
import Link from 'next/link';
import { serverGet } from '@/lib/server-fetch';
import { SubscriptionPlan } from '@/lib/types';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { BadgeCheckIcon, BuildingIcon, ChartIcon, MegaphoneIcon, VideoIcon } from '@/components/icons';
import { PlanComparisonDemo } from '@/components/PlanComparisonDemo';
import { MarcaMedicaPhone } from '@/components/MarcaMedicaPhone';
import { ORGANIZATIONS_LAUNCHED } from '@/lib/features';

export const metadata: Metadata = {
  title: 'Planes y precios',
  description: 'Planes para médicos, farmacias, laboratorios y clínicas en Guía Médica Monagas. Regístrate gratis o publica un perfil verificado completo.',
};

const DOCTOR_TIERS = ['FREE', 'PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'];

// Lo que hace el equipo cada mes; la lista detallada sale del catálogo (/admin/planes).
const MARCA_MEDICA_PILLARS = [
  { title: 'Producción', body: 'Guion · grabación · edición · subtítulos', Icon: VideoIcon },
  { title: 'Difusión', body: 'Publicación colaborativa · perfil destacado', Icon: MegaphoneIcon },
  { title: 'Medición', body: 'Visitas · contactos · citas · informe mensual', Icon: ChartIcon },
];

function formatUsd(value: string) {
  const n = Number(value);
  return n === 0 ? 'Gratis' : `$${n}`;
}

export default async function PlansPage() {
  const [plans, showcase] = await Promise.all([
    serverGet<SubscriptionPlan[]>('/subscriptions/plans').then((list) => list ?? []),
    serverGet<{ sampleVideoId: string | null }>('/subscriptions/showcase'),
  ]);
  const doctorPlans = DOCTOR_TIERS.map((tier) => plans.find((p) => p.tier === tier)).filter(
    (p): p is SubscriptionPlan => !!p,
  );
  const agencyPlan = plans.find((p) => p.tier === 'AGENCY');
  const orgPlan = plans.find((p) => p.tier === 'ORGANIZATION');

  return (
    <div className="container-page py-14">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl">Planes para tu perfil médico</h1>
          <p className="mt-3 text-lg text-ink-600">
            Empieza gratis o desbloquea foto, biografía, WhatsApp, publicaciones y más visibilidad en el directorio. Y si
            quieres crecer también fuera de la plataforma, con Marca Médica producimos contigo contenido en video cada mes.
          </p>
        </div>
      </Reveal>

      <RevealGroup className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {doctorPlans.map((plan) => {
          const highlighted = plan.tier === 'PROFESSIONAL_PLUS';
          return (
            <RevealItem key={plan.id}>
              <div
                className={`flex h-full flex-col rounded-xl2 border p-6 ${
                  highlighted ? 'border-pine-700 bg-pine-800 text-white shadow-card' : 'card'
                }`}
              >
                {highlighted && (
                  <span className="mb-3 inline-block w-fit rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                    Más elegido
                  </span>
                )}
                <h2 className={`text-lg font-semibold ${highlighted ? 'text-white' : 'text-ink-900'}`}>{plan.name}</h2>
                <p className={`mt-3 text-3xl font-bold ${highlighted ? 'text-white' : 'text-pine-700'}`}>
                  {formatUsd(plan.priceUsd)}
                  {Number(plan.priceUsd) > 0 && (
                    <span className={`text-sm font-normal ${highlighted ? 'text-pine-100' : 'text-ink-500'}`}>/mes</span>
                  )}
                </p>
                {plan.description && (
                  <p className={`mt-2 text-sm ${highlighted ? 'text-pine-100' : 'text-ink-500'}`}>{plan.description}</p>
                )}
                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  {(plan.features ?? []).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <BadgeCheckIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${highlighted ? 'text-white' : 'text-pine-600'}`} />
                      <span className={highlighted ? 'text-pine-50' : 'text-ink-700'}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/registro?tipo=medico"
                  className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-transform hover:-translate-y-0.5 ${
                    highlighted ? 'bg-white text-pine-800 hover:bg-pine-50' : 'bg-pine-700 text-white hover:bg-pine-800'
                  }`}
                >
                  {Number(plan.priceUsd) === 0 ? 'Registrarme gratis' : 'Elegir este plan'}
                </Link>
              </div>
            </RevealItem>
          );
        })}
      </RevealGroup>

      {agencyPlan && (
        <Reveal delay={0.05}>
          {/* Marca Médica no es otro nivel de software: es un servicio de contenido. Va aparte y en grande. */}
          <section
            aria-labelledby="marca-medica"
            className="mx-auto mt-14 max-w-6xl overflow-hidden rounded-[28px] bg-gradient-to-br from-ink-950 via-pine-950 to-ink-900 text-white shadow-card"
          >
            <div className="grid gap-10 p-6 sm:p-10 lg:p-14 xl:grid-cols-[1.2fr_0.8fr] xl:items-center xl:gap-14">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Servicio de producción de contenido</p>
                <h2 id="marca-medica" className="mt-3 text-3xl text-white sm:text-4xl">
                  {agencyPlan.name}
                </h2>
                <p className="mt-1 text-lg text-gold-200">Tu conocimiento. Nuestra producción. Más visibilidad.</p>
                <p className="mt-6 text-2xl font-semibold leading-snug text-white sm:text-3xl">
                  Convierte tu experiencia médica en contenido profesional
                </p>
                <p className="mt-3 max-w-xl text-pine-100">
                  Tú aportas el conocimiento. Nosotros nos encargamos de convertirlo en contenido: lo planificamos, lo grabamos,
                  lo editamos y lo difundimos contigo, sin que tengas que hacerlo por tu cuenta.
                </p>
                <div className="mt-8 flex flex-wrap items-end gap-x-6 gap-y-3">
                  <p className="text-5xl font-bold text-white">
                    {formatUsd(agencyPlan.priceUsd)}
                    <span className="text-base font-normal text-pine-200"> /mes</span>
                  </p>
                  <p className="rounded-full bg-gold-400/15 px-4 py-2 text-sm font-semibold text-gold-200 ring-1 ring-gold-300/40">
                    2 videos profesionales cada mes
                  </p>
                </div>
                <ul className="mt-8 grid gap-3 sm:grid-cols-3">
                  {MARCA_MEDICA_PILLARS.map(({ title, body, Icon }) => (
                    <li key={title} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <Icon className="h-5 w-5 text-gold-300" aria-hidden="true" />
                      <p className="mt-2 font-semibold text-white">{title}</p>
                      <p className="mt-1 text-sm text-pine-100">{body}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-col items-start gap-2">
                  <Link
                    href="/registro?tipo=medico"
                    className="rounded-xl bg-gold-400 px-6 py-3 text-base font-semibold text-ink-950 transition-transform hover:-translate-y-0.5 hover:bg-gold-300"
                  >
                    Quiero impulsar mi marca
                  </Link>
                  <p className="text-xs text-pine-200">Sin renovación automática · Pago mensual · Sin permanencia</p>
                </div>
              </div>
              <MarcaMedicaPhone videoId={showcase?.sampleVideoId ?? null} />
            </div>
            <div className="border-t border-white/10 bg-white/[0.03] p-6 sm:p-10 lg:px-14">
              <h3 className="text-lg font-semibold text-white">Incluido cada mes</h3>
              <ul className="mt-4 grid gap-x-10 gap-y-2.5 sm:grid-cols-2">
                {(agencyPlan.features ?? []).map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-pine-50">
                    <BadgeCheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-300" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-8 text-base font-medium text-white">Tú hablas de medicina. Nosotros nos encargamos del contenido.</p>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-pine-200">
                Producción realizada junto a Guía Médica Monagas. El contenido es informativo y sigue la{' '}
                <Link href="/publicidad-medica" className="underline">
                  Política de publicidad médica
                </Link>
                : no promete resultados. El plan requiere el 100 % de tus documentos aprobados, se contrata y se paga desde tu
                panel de médico, y no cambia tu verificación.
              </p>
            </div>
          </section>
        </Reveal>
      )}

      <Reveal delay={0.08} className="mt-20">
        <PlanComparisonDemo />
      </Reveal>

      {orgPlan && (
        <Reveal delay={0.1}>
          <div className="mt-16 rounded-xl2 border border-ink-100 bg-white p-8 md:flex md:items-center md:justify-between md:gap-8">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
                <BuildingIcon className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-ink-900">{orgPlan.name}</h2>
                <p className="mt-1 max-w-lg text-sm text-ink-600">{orgPlan.description}</p>
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-600">
                  {(orgPlan.features ?? []).map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <BadgeCheckIcon className="h-4 w-4 text-pine-600" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-6 flex flex-shrink-0 flex-col items-start gap-3 md:mt-0 md:items-end">
              <p className="text-3xl font-bold text-pine-700">
                ${orgPlan.priceUsd}
                <span className="text-sm font-normal text-ink-500">/mes</span>
              </p>
              {ORGANIZATIONS_LAUNCHED ? (
                <Link
                  href="/registro?tipo=organizacion"
                  className="rounded-lg bg-pine-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pine-800"
                >
                  Contactar para registrar mi organización
                </Link>
              ) : (
                <Link
                  href="/farmacias"
                  className="rounded-lg border border-gold-200 bg-gold-50 px-5 py-2.5 text-sm font-semibold text-gold-800 hover:bg-gold-100"
                >
                  Próximamente
                </Link>
              )}
            </div>
          </div>
        </Reveal>
      )}

      <Reveal delay={0.15}>
        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-ink-500">
          Los precios se cotizan en USD. El pago se realiza por Pago Móvil en bolívares, a la tasa oficial del BCV vigente
          al suscribirse. Los datos para pagar se muestran dentro de tu panel de médico, en «Suscripción y pagos», y desde
          ahí mismo reportas el pago. Los planes son mensuales y no se renuevan ni se cobran de forma automática. La verificación de
          credenciales y el perfil básico son gratuitos, y la verificación es la misma en todos los planes: pagar nunca
          sustituye ni acelera la revisión de documentos, ni indica superioridad clínica. Condiciones completas en{' '}
          <Link href="/pagos-y-suscripciones" className="underline">
            Pagos y suscripciones
          </Link>{' '}
          y{' '}
          <Link href="/reembolsos" className="underline">
            Cancelación y reembolsos
          </Link>
          .
        </p>
      </Reveal>
    </div>
  );
}
