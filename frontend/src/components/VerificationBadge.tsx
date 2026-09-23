import { cn } from '@/lib/cn';
import type { PlanTier } from '@/lib/types';

type OrgType = 'PHARMACY' | 'LABORATORY' | 'CLINIC';

const DOCTOR_TIER_COLORS: Record<PlanTier, string> = {
  FREE: 'text-ink-300',
  PROFESSIONAL: 'text-blue-500',
  PROFESSIONAL_PLUS: 'text-indigo-600',
  PREMIUM: 'text-gold-500',
  ORGANIZATION: 'text-ink-300',
};

const DOCTOR_TIER_TITLES: Record<PlanTier, string> = {
  FREE: 'Credenciales verificadas · Perfil Básico',
  PROFESSIONAL: 'Credenciales verificadas · Perfil Profesional',
  PROFESSIONAL_PLUS: 'Credenciales verificadas · Perfil Profesional Plus',
  PREMIUM: 'Credenciales verificadas · Perfil Premium',
  ORGANIZATION: 'Credenciales verificadas',
};

const ORG_TYPE_COLORS: Record<OrgType, string> = {
  PHARMACY: 'text-green-500',
  LABORATORY: 'text-purple-500',
  CLINIC: 'text-orange-500',
};

const ORG_TYPE_TITLES: Record<OrgType, string> = {
  PHARMACY: 'Farmacia verificada',
  LABORATORY: 'Laboratorio verificado',
  CLINIC: 'Clínica verificada',
};

type Props =
  | { kind: 'doctor'; tier: PlanTier; className?: string }
  | { kind: 'organization'; type: OrgType; className?: string };

/**
 * Ícono de verificación. Todos los perfiles publicados pasaron la MISMA
 * verificación de credenciales; el color solo indica el nivel de perfil
 * (gris Básico, azul Profesional, dorado Premium) o el tipo de organización.
 */
export function VerificationBadge(props: Props) {
  const color = props.kind === 'doctor' ? DOCTOR_TIER_COLORS[props.tier] : ORG_TYPE_COLORS[props.type];
  const title = props.kind === 'doctor' ? DOCTOR_TIER_TITLES[props.tier] : ORG_TYPE_TITLES[props.type];

  return (
    <span title={title} className={cn('inline-flex flex-shrink-0', color, props.className)}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2.5l2.2 1.3 2.5-.2 1 2.3 2.3 1-.2 2.5 1.3 2.2-1.3 2.2.2 2.5-2.3 1-1 2.3-2.5-.2L12 21.5l-2.2-1.3-2.5.2-1-2.3-2.3-1 .2-2.5L3 12l1.3-2.2-.2-2.5 2.3-1 1-2.3 2.5.2L12 2.5Z"
        />
        <path d="M8.3 12.1l2.4 2.4 4.9-5.2" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">{title}</span>
    </span>
  );
}
