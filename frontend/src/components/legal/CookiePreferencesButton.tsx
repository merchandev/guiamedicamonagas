'use client';

import { openCookiePreferences } from '@/components/CookieConsent';
import { Button } from '@/components/ui/Button';

/** Abre el panel de preferencias de cookies desde una página de texto legal. */
export function CookiePreferencesButton({ label = 'Configurar cookies' }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={openCookiePreferences}>
      {label}
    </Button>
  );
}
