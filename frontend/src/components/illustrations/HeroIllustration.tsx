'use client';

import { motion } from 'framer-motion';
import { BadgeCheckIcon, ShieldCheckIcon, UserRoundIcon, WhatsAppIcon } from '@/components/icons';

const float = (delay: number) => ({
  animate: { y: [0, -10, 0] },
  transition: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' as const, delay },
});

export function HeroIllustration() {
  return (
    <div className="relative mx-auto flex h-full min-h-[320px] w-full max-w-sm items-center justify-center">
      {/* Manchas de color decorativas */}
      <div className="absolute -top-10 -left-10 h-56 w-56 rounded-full bg-pine-200/50 blur-3xl" />
      <div className="absolute -bottom-14 -right-6 h-56 w-56 rounded-full bg-gold-200/50 blur-3xl" />

      {/* Tarjeta de perfil (vista previa de un perfil verificado) */}
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: -2 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="card relative z-10 w-72 -rotate-2 p-5"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-pine-100">
            <UserRoundIcon className="h-7 w-7 text-pine-700" />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-pine-700 ring-2 ring-white">
              <BadgeCheckIcon className="h-3.5 w-3.5 text-white" />
            </span>
          </div>
          <div className="flex-1">
            <div className="h-3 w-28 rounded-full bg-ink-200" />
            <div className="mt-2 h-2.5 w-20 rounded-full bg-pine-200" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {['MPPS', 'COLMED'].map((label) => (
            <div key={label} className="rounded-lg bg-ink-50 px-2 py-2 text-center">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
              <p className="text-xs font-bold text-pine-800">✓</p>
            </div>
          ))}
        </div>

        <div className="mt-4 h-9 w-full rounded-lg bg-pine-700/90" />
      </motion.div>

      {/* Chips flotantes */}
      <motion.div
        {...float(0)}
        className="absolute -left-6 top-6 z-20 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card"
      >
        <ShieldCheckIcon className="h-4 w-4 text-pine-700" />
        <span className="text-xs font-semibold text-ink-800">Verificado</span>
      </motion.div>

      <motion.div
        {...float(1.2)}
        className="absolute -right-4 top-1/2 z-20 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card"
      >
        <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
        <span className="text-xs font-semibold text-ink-800">Respuesta rápida</span>
      </motion.div>

      <motion.div
        {...float(0.6)}
        className="absolute -left-2 bottom-2 z-20 rounded-xl bg-white px-3 py-2 shadow-card"
      >
        <span className="text-xs font-semibold text-ink-800">13 municipios</span>
      </motion.div>
    </div>
  );
}
