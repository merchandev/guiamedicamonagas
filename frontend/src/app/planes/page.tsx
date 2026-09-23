import type { Metadata } from 'next';
import Link from 'next/link';
import { serverGet } from '@/lib/server-fetch';
import { SubscriptionPlan } from '@/lib/types';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { BadgeCheckIcon, BuildingIcon } from '@/components/icons';
import { PlanComparisonDemo } from '@/components/PlanComparisonDemo';

export const metadata: Metadata = {
  title: 'Planes y precios',
  description: 'Planes para médicos, farmacias, laboratorios y clínicas en Guía Médica Monagas. Regístrate gratis o publica un perfil verificado completo.',
};

const DOCTOR_TIERS = ['FREE', 'PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'];

function formatUsd(value: string) {
  const n = Number(value);
  return n === 0 ? 'Gratis' : `$${n}`;
}

export default async function PlansPage() {
  const plans = (await serverGet<SubscriptionPlan[]>('/subscriptions/plans')) ?? [];
  const doctorPlans = DOCTOR_TIERS.map((tier) => plans.find((p) => p.tier === tier)).filter(
    (p): p is SubscriptionPlan => !!p,
  );
  const orgPlan = plans.find((p) => p.tier === 'ORGANIZATION');

  return (
    <div className="container-page py-14">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl">Planes para tu perfil médico</h1>
          <p className="mt-3 text-lg text-ink-600">
            Empieza gratis o desbloquea foto, biografía, WhatsApp, publicaciones y más visibilidad en el directorio.
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
                    <span className={`text-sm font-normal ${highlighted ? 'text-pine-100' : 'text-ink-400'}`}>/mes</span>
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
                  href="/registro"
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
                <span className="text-sm font-normal text-ink-400">/mes</span>
              </p>
              <Link
                href="/registro"
                className="rounded-lg bg-pine-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pine-800"
              >
                Contactar para registrar mi organización
              </Link>
            </div>
          </div>
        </Reveal>
      )}

      <Reveal delay={0.15}>
        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-ink-400">
          Los precios se cotizan en USD. El pago se realiza por Pago Móvil en bolívares al equivalente vigente el día
          del pago. La verificación de credenciales y el perfil básico son gratuitos, y la verificación es la misma en todos
          los planes: pagar nunca sustituye ni acelera la revisión de documentos.
        </p>
      </Reveal>
    </div>
  );
}
