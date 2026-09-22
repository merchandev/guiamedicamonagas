'use client';

import { useEffect } from 'react';
import { trackProfileView } from '@/components/ContactButtons';

export function ProfileViewTracker({ professionalId }: { professionalId: string }) {
  useEffect(() => {
    trackProfileView(professionalId);
  }, [professionalId]);
  return null;
}
