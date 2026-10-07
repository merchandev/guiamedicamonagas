'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { PLAN_TIER_LABELS } from '@/lib/labels';
import { formatDate, formatTime } from '@/lib/dates';
import type { DoctorPlanStatus } from '@/lib/types';

const DAY = 86_400_000;
const LINK_CLASS =
  'inline-block rounded-lg bg-pine-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-pine-800';

/** «20 de octubre de 2026 a las 9:15 p. m.» (hora de Caracas). */
function endLabel(value: string) {
  return `${formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' })} a las ${formatTime(value)}`;
}

/** Cierra la oración sin un punto doble tras «p. m.». */
const period = (text: string) => (text.endsWith('.') ? text : `${text}.`);

/**
 * Plan del médico en su panel: la prueba gratuita de Plus (14 días, una sola
 * vez), su plan pagado o, sin plan, qué le falta para aparecer en el
 * directorio. En «Suscripción y pagos» va sin el enlace (ya está ahí).
 */
export function PlanStatusCard({ plan, withLink = true }: { plan: DoctorPlanStatus; withLink?: boolean }) {
  // Los días que quedan se cuentan desde que se abrió el panel.
  const [now] = useState(() => Date.now());
  const link = (label: string) =>
    withLink ? (
      <Link href="/dashboard/pagos" className={`${LINK_CLASS} mt-4`}>
        {label}
      </Link>
    ) : null;

  if (plan.kind === 'TRIAL' && plan.endsAt) {
    const left = new Date(plan.endsAt).getTime() - now;
    if (left <= 0) {
      return (
        <section aria-labelledby="plan-estado" className="card border-gold-200 bg-gold-50/60 p-6">
          <h2 id="plan-estado" className="font-semibold text-ink-900">Tu prueba gratis del plan Plus terminó</h2>
          <p className="mt-1 text-sm text-ink-700">
            Elige un plan y reporta tu pago para seguir apareciendo en el directorio y recibiendo citas.
          </p>
          {link('Elegir mi plan')}
        </section>
      );
    }
    const days = Math.ceil(left / DAY);
    return (
      <section aria-labelledby="plan-estado" className="card border-pine-200 bg-pine-50/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="plan-estado" className="font-semibold text-ink-900">Prueba gratis del plan Plus</h2>
          <Badge tone={days <= 3 ? 'amber' : 'pine'}>{days === 1 ? 'Te queda 1 día' : `Te quedan ${days} días`}</Badge>
        </div>
        <p className="mt-2 text-sm text-ink-700">
          Hasta el {endLabel(plan.endsAt)} tu perfil aparece en el directorio con las herramientas del plan Plus. Para seguir
          apareciendo después, elige un plan y reporta tu pago. Si pagas antes, los días que te quedan se suman a tu plan.
        </p>
        {link('Elegir mi plan')}
      </section>
    );
  }

  if (plan.kind === 'PAID') {
    const label = PLAN_TIER_LABELS[plan.tier];
    return (
      <section aria-labelledby="plan-estado" className="card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="plan-estado" className="font-semibold text-ink-900">Tu plan</h2>
          {label && <Badge tone={label.tone}>{label.label}</Badge>}
        </div>
        {plan.endsAt && <p className="mt-1 text-sm text-ink-600">{period(`Vigente hasta el ${endLabel(plan.endsAt)}`)}</p>}
        {withLink && (
          <Link href="/dashboard/pagos" className="mt-3 inline-block text-sm font-medium text-pine-700 hover:underline">
            Ver mi suscripción →
          </Link>
        )}
      </section>
    );
  }

  if (plan.trialAvailable) {
    return (
      <section aria-labelledby="plan-estado" className="card p-6">
        <h2 id="plan-estado" className="font-semibold text-ink-900">Aún no tienes un plan</h2>
        <p className="mt-1 text-sm text-ink-700">
          Tu perfil todavía no aparece en el directorio. Con todos tus documentos aprobados, tu biografía y tu foto, se
          publica solo con <strong>14 días gratis del plan Plus</strong>. Si prefieres no esperar, el plan Profesional te
          publica desde el 60 % de tus documentos aprobados.
        </p>
        {link('Ver los planes')}
      </section>
    );
  }

  return (
    <section aria-labelledby="plan-estado" className="card border-gold-200 bg-gold-50/60 p-6">
      <h2 id="plan-estado" className="font-semibold text-ink-900">Sin plan activo</h2>
      <p className="mt-1 text-sm text-ink-700">
        {plan.trialEndedAt && `${period(`Tu prueba gratis terminó el ${endLabel(plan.trialEndedAt)}`)} `}
        Tu perfil no aparece en el directorio ni recibe citas nuevas. Tus datos, tus documentos y las citas que ya tenías se
        conservan. Elige un plan y reporta tu pago para volver a aparecer.
      </p>
      {link('Elegir mi plan')}
    </section>
  );
}
