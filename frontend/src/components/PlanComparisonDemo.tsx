'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { BadgeCheckIcon, BuildingIcon, LockIcon, MapPinIcon, SparklesIcon, WhatsAppIcon } from '@/components/icons';
import { VerificationBadge } from '@/components/VerificationBadge';
import { DOCTOR_SOCIAL_LIMITS, SOCIAL_PLATFORM_COLORS, SOCIAL_PLATFORM_ICONS, type SocialPlatform } from '@/lib/social';

type DoctorTier = 'FREE' | 'PROFESSIONAL' | 'PROFESSIONAL_PLUS' | 'PREMIUM';
type DemoTier = DoctorTier | 'ORGANIZATION';

const TIER_ORDER: Record<DoctorTier, number> = {
  FREE: 0,
  PROFESSIONAL: 1,
  PROFESSIONAL_PLUS: 2,
  PREMIUM: 3,
};

const TABS: { tier: DemoTier; label: string }[] = [
  { tier: 'FREE', label: 'Básico' },
  { tier: 'PROFESSIONAL', label: 'Profesional' },
  { tier: 'PROFESSIONAL_PLUS', label: 'Profesional Plus' },
  { tier: 'PREMIUM', label: 'Premium' },
  { tier: 'ORGANIZATION', label: 'Organizaciones' },
];

const FEATURE_ROWS: { label: string; min: DoctorTier }[] = [
  { label: 'Nombre, especialidad, N° MPPS / Colegio / INPREMEDICO', min: 'FREE' },
  { label: 'Foto de perfil y biografía', min: 'PROFESSIONAL' },
  { label: 'Botón directo de WhatsApp', min: 'PROFESSIONAL' },
  { label: 'Estadísticas básicas de tu perfil', min: 'PROFESSIONAL' },
  { label: 'Formulario de mensajes desde el perfil', min: 'PROFESSIONAL_PLUS' },
  { label: 'Publicaciones y varias sedes', min: 'PROFESSIONAL_PLUS' },
  { label: 'Redes sociales (hasta 2: Instagram/Facebook/TikTok)', min: 'PROFESSIONAL_PLUS' },
  { label: 'Perfil destacado y prioridad en el buscador', min: 'PREMIUM' },
  { label: 'Publicaciones ilimitadas, redes + web y analítica avanzada', min: 'PREMIUM' },
];

/** Chip de ícono no interactivo, solo para la vista previa (no navega ni trackea clics reales). */
function SocialIconChip({ platform }: { platform: SocialPlatform }) {
  const Icon = SOCIAL_PLATFORM_ICONS[platform];
  return (
    <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', SOCIAL_PLATFORM_COLORS[platform])}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

function Locked({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink-200 bg-ink-50/60 px-4 py-3 text-sm text-ink-400">
      <LockIcon className="h-4 w-4 flex-shrink-0" />
      <span>{label}</span>
    </div>
  );
}

function DoctorDemo({ tier }: { tier: DoctorTier }) {
  const rank = TIER_ORDER[tier];
  const canRich = rank >= TIER_ORDER.PROFESSIONAL;
  const canPlus = rank >= TIER_ORDER.PROFESSIONAL_PLUS;
  const featured = tier === 'PREMIUM';

  return (
    <div className="card p-6 sm:p-8">
      <div className="mb-6 flex flex-col items-start gap-5 sm:flex-row">
        {canRich ? (
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pine-600 to-pine-800 text-2xl font-semibold text-white shadow-md">
            VB
          </div>
        ) : (
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-300">
            <LockIcon className="h-7 w-7" />
          </div>
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl text-ink-950">Dra. Valentina Blanco</h3>
            <VerificationBadge kind="doctor" tier={tier} />
            {featured && <Badge tone="gold">Destacado</Badge>}
          </div>
          <p className="mt-1 text-sm text-pine-700">Cardiología · Maturín, Monagas</p>
          {canRich ? (
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-600">
              Cardióloga egresada de la UDO con 12 años de experiencia. Enfoque en prevención cardiovascular y
              ecocardiografía.
            </p>
          ) : (
            <p className="mt-2 max-w-md text-sm italic text-ink-400">
              Este plan no incluye foto ni biografía en el perfil público.
            </p>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-pine-100 bg-pine-50/60 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-pine-900">Transparencia médica y legal</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase text-ink-500">N° MPPS</p>
            <p className="text-sm font-bold text-ink-900">45.231</p>
          </div>
          <div className="rounded-lg bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase text-ink-500">Colegio Monagas</p>
            <p className="text-sm font-bold text-ink-900">1.204</p>
          </div>
          <div className="rounded-lg bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase text-ink-500">INPREMEDICO</p>
            <p className="text-sm font-bold text-ink-900">3.887</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-pine-700">
          Estos datos se muestran siempre, en todos los planes: la verificación legal no es un beneficio pago.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink-900">Contacto</h4>
          {canRich ? (
            <a className="flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white pointer-events-none">
              <WhatsAppIcon className="h-4 w-4" /> Escribir por WhatsApp
            </a>
          ) : (
            <Locked label="WhatsApp disponible desde el plan Profesional" />
          )}
          <div className="mt-3">
            {canPlus ? (
              <div className="rounded-lg border border-ink-100 p-3 text-sm text-ink-600">
                <p className="font-medium text-ink-800">Otras sedes</p>
                <p className="mt-1 flex items-center gap-1.5 text-ink-500">
                  <MapPinIcon className="h-3.5 w-3.5" /> Clínica Maturín Centro — Av. Bolívar
                </p>
                {tier === 'PREMIUM' && (
                  <p className="mt-1 flex items-center gap-1.5 text-ink-500">
                    <MapPinIcon className="h-3.5 w-3.5" /> Consultorio Punta de Mata
                  </p>
                )}
              </div>
            ) : (
              <Locked label="Varias sedes desde el plan Profesional Plus" />
            )}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink-900">Enviar un mensaje</h4>
          {canPlus ? (
            <div className="space-y-2 rounded-lg border border-ink-100 p-3">
              <div className="h-8 rounded-md bg-ink-50" />
              <div className="h-8 rounded-md bg-ink-50" />
              <div className="h-16 rounded-md bg-ink-50" />
              <div className="h-8 w-28 rounded-md bg-pine-700/90" />
            </div>
          ) : (
            <Locked label="Formulario de mensajes desde el plan Profesional Plus" />
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-ink-100 pt-5">
        <h4 className="mb-3 text-sm font-semibold text-ink-900">Publicaciones</h4>
        {canPlus ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-ink-100 p-3">
              <p className="text-sm font-semibold text-ink-900">5 hábitos para cuidar tu corazón</p>
              <p className="mt-1 text-xs text-ink-400">Hace 3 días</p>
            </div>
            {tier === 'PREMIUM' ? (
              <>
                <div className="rounded-lg border border-ink-100 p-3">
                  <p className="text-sm font-semibold text-ink-900">¿Cada cuánto hacerse un ecocardiograma?</p>
                  <p className="mt-1 text-xs text-ink-400">Hace 1 semana</p>
                </div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-gold-700">
                  <SparklesIcon className="h-3.5 w-3.5" /> Publicaciones ilimitadas en el plan Premium
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-400">Hasta el límite de publicaciones de tu plan.</p>
            )}
          </div>
        ) : (
          <Locked label="Publicaciones disponibles desde el plan Profesional Plus" />
        )}
      </div>

      <div className="mt-6 border-t border-ink-100 pt-5">
        <h4 className="mb-3 text-sm font-semibold text-ink-900">Redes sociales y web</h4>
        {canPlus ? (
          <div className="flex flex-wrap items-center gap-2">
            {(tier === 'PREMIUM'
              ? DOCTOR_SOCIAL_LIMITS.PREMIUM.allowedPlatforms
              : DOCTOR_SOCIAL_LIMITS.PROFESSIONAL_PLUS.allowedPlatforms.slice(0, 2)
            ).map((platform) => (
              <SocialIconChip key={platform} platform={platform} />
            ))}
            <span className="text-xs text-ink-500">
              {tier === 'PREMIUM'
                ? 'Las 3 redes (Instagram/Facebook/TikTok) + Web'
                : 'Hasta 2 redes a elegir, sin repetir'}
            </span>
          </div>
        ) : (
          <Locked label="Redes sociales y web desde el plan Profesional Plus" />
        )}
      </div>

      {featured && (
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-gold-50 px-4 py-3 text-sm font-medium text-gold-800">
          <SparklesIcon className="h-4 w-4 flex-shrink-0" /> Este perfil aparece primero en los resultados de
          búsqueda y en secciones destacadas del sitio.
        </div>
      )}
    </div>
  );
}

function OrganizationDemo() {
  return (
    <div className="card p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-700">
          <BuildingIcon className="h-9 w-9" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl text-ink-950">Laboratorio Clínico San Rafael</h3>
            <VerificationBadge kind="organization" type="LABORATORY" />
          </div>
          <p className="mt-1 text-sm text-ink-600">Laboratorio clínico · Maturín, Monagas</p>
        </div>
      </div>
      <p className="mb-5 text-sm text-ink-600">
        Exámenes de laboratorio, imagenología básica y perfil hormonal, con resultados en 24 horas.
      </p>
      <div className="mb-5">
        <h4 className="mb-2 text-sm font-semibold text-ink-900">Sedes (hasta 4 incluidas)</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {['Sede Centro — Av. Bolívar', 'Sede Las Cocuizas', 'Sede Punta de Mata', 'Sede Caripito'].map((s) => (
            <div key={s} className="flex items-center gap-1.5 rounded-lg border border-ink-100 p-3 text-sm text-ink-600">
              <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0 text-pine-600" /> {s}
            </div>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink-900">Redes sociales y web</h4>
        <div className="flex flex-wrap items-center gap-2">
          {(['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WEBSITE'] as const).map((platform) => (
            <SocialIconChip key={platform} platform={platform} />
          ))}
          <span className="text-xs text-ink-500">Las 3 redes + Web, incluidas siempre</span>
        </div>
      </div>
    </div>
  );
}

export function PlanComparisonDemo() {
  const [tier, setTier] = useState<DemoTier>('FREE');
  const rank = tier === 'ORGANIZATION' ? -1 : TIER_ORDER[tier];

  return (
    <div>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl text-ink-950">Mira la diferencia entre cada plan</h2>
        <p className="mt-2 text-ink-600">
          Un mismo perfil de ejemplo, mostrado tal como lo verían tus pacientes en cada plan.
        </p>
        <p className="mt-1 text-xs text-ink-400">
          El check de verificación cambia de color según tu plan: gris (Básico), azul (Profesional), índigo (Plus),
          dorado (Premium) — y para organizaciones, verde (farmacias), morado (laboratorios) y naranja (clínicas).
        </p>
      </div>

      <div className="mx-auto mt-6 flex max-w-full flex-wrap justify-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.tier}
            type="button"
            onClick={() => setTier(t.tier)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              tier === t.tier ? 'bg-pine-800 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-8 max-w-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={tier}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {tier === 'ORGANIZATION' ? <OrganizationDemo /> : <DoctorDemo tier={tier} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {tier !== 'ORGANIZATION' && (
        <div className="mx-auto mt-10 max-w-3xl overflow-x-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-y-1.5 text-sm">
            <tbody>
              {FEATURE_ROWS.map((row) => {
                const included = rank >= TIER_ORDER[row.min];
                return (
                  <tr key={row.label}>
                    <td className="rounded-l-lg bg-white px-4 py-2.5 text-ink-700">{row.label}</td>
                    <td className="w-12 rounded-r-lg bg-white px-4 py-2.5 text-right">
                      {included ? (
                        <BadgeCheckIcon className="ml-auto h-5 w-5 text-pine-600" />
                      ) : (
                        <LockIcon className="ml-auto h-4 w-4 text-ink-300" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
