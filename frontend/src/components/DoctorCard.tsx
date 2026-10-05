'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ProfessionalListItem } from '@/lib/types';
import { MarcaMedicaLabel, VerificationBadge } from '@/components/VerificationBadge';
import { cn } from '@/lib/cn';
import { formatAverage, opinionsLabel } from '@/lib/reviews';
import { Stars } from '@/components/reviews/Stars';

export function DoctorCard({ doctor }: { doctor: ProfessionalListItem }) {
  const initials = `${doctor.firstName[0] ?? ''}${doctor.lastName[0] ?? ''}`.toUpperCase();

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
      <Link
        href={`/medicos/${doctor.slug}`}
        className={cn(
          'card relative flex gap-4 p-5 transition-shadow hover:shadow-card',
          doctor.isFeatured && 'border-gold-300 ring-1 ring-gold-200',
        )}
      >
        {doctor.isFeatured && (
          <span
            title="Espacio patrocinado: el médico tiene el plan Premium o Marca Médica. No es una recomendación clínica."
            className="badge absolute -top-2.5 right-4 bg-gold-500 text-white shadow-soft"
          >
            Destacado
          </span>
        )}
        {doctor.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doctor.photoUrl}
            alt={`${doctor.firstName} ${doctor.lastName}`}
            className="h-16 w-16 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-pine-100 text-lg font-semibold text-pine-800">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 max-w-full truncate font-semibold text-ink-900">
              Dr(a). {doctor.firstName} {doctor.lastName}
            </h3>
            <VerificationBadge kind="doctor" tier={doctor.planTier} verified={doctor.verificationStatus === 'VERIFIED'} />
            {doctor.planTier === 'AGENCY' && <MarcaMedicaLabel />}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-600">
            {doctor.specialties.map((s) => s.specialty.name).join(', ') || 'Medicina General'}
          </p>
          {doctor.municipality && <p className="mt-0.5 text-xs text-ink-500">{doctor.municipality}, Monagas</p>}
          {doctor.rating?.average != null && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-600">
              <Stars value={doctor.rating.average} size="sm" />
              <span>
                {formatAverage(doctor.rating.average)} · {opinionsLabel(doctor.rating.count)}
              </span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-ink-500">
            {doctor.mppsNumber && <span className="rounded bg-ink-50 px-1.5 py-0.5">MPPS {doctor.mppsNumber}</span>}
            {doctor.colmedMonagasNumber && (
              <span className="rounded bg-ink-50 px-1.5 py-0.5">Colmed {doctor.colmedMonagasNumber}</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
