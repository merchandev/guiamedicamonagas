'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import TermsModal from '@/components/TermsModal';

/**
 * Si los Términos o la Política cambiaron de versión desde la última vez que
 * el usuario los aceptó, se le pide aceptar la versión vigente. Cerrar el
 * aviso cierra la sesión: no se sigue usando la plataforma con una versión
 * no aceptada.
 */
export function LegalAcceptanceGate() {
  const { user, acceptLegal, logout } = useAuth();
  const [saving, setSaving] = useState(false);

  if (!user?.needsLegalAcceptance) return null;

  return (
    <TermsModal
      isOpen
      closeOnAccept={false}
      cancelLabel="Cerrar sesión"
      acceptLabel={saving ? 'Guardando…' : 'Acepto la nueva versión'}
      onClose={() => {
        if (!saving) void logout();
      }}
      onAccept={async () => {
        setSaving(true);
        try {
          await acceptLegal();
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}
