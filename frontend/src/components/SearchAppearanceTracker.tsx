'use client';

import { useEffect } from 'react';
import { trackSearchAppearances } from '@/lib/analytics';

/** Cuenta una aparición de cada médico listado (solo con el consentimiento de análisis). */
export function SearchAppearanceTracker({
  professionalIds,
  specialty,
  municipality,
}: {
  professionalIds: string[];
  specialty?: string;
  municipality?: string;
}) {
  const ids = professionalIds.join(',');
  useEffect(() => {
    trackSearchAppearances(ids.split(',').filter(Boolean), { specialty, municipality });
  }, [ids, specialty, municipality]);
  return null;
}
