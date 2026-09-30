'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth, ApiError } from '@/lib/auth-context';
import { LEGAL_DOCS, LEGAL_EFFECTIVE_DATE_LABEL, type LegalDocumentKey } from '@/lib/legal';
import { LegalConsentChecklist, allAccepted } from '@/components/legal/LegalConsentChecklist';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

// Los textos legales se pueden leer sin aceptar antes: el aviso no los tapa.
const READABLE_PATHS = new Set(['/legal', ...LEGAL_DOCS.map((doc) => doc.href)]);

/**
 * Si algún texto legal cambió de versión desde la última vez que el usuario
 * lo aceptó (o nunca lo aceptó), se le pide aceptarlo, con una casilla por
 * documento. Cerrar el aviso cierra la sesión: no se sigue usando la
 * plataforma con una versión no aceptada.
 */
export function LegalAcceptanceGate() {
  const { user, acceptLegal, logout } = useAuth();
  const pathname = usePathname();
  const [checked, setChecked] = useState<LegalDocumentKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.needsLegalAcceptance || READABLE_PATHS.has(pathname)) return null;
  const pending = user.pendingLegalDocuments ?? [];

  const accept = async () => {
    setSaving(true);
    setError(null);
    try {
      await acceptLegal(pending);
      setChecked([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar tu aceptación. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) void logout();
      }}
      title="Actualizamos nuestros textos legales"
      widthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          Hay versiones nuevas, vigentes desde el {LEGAL_EFFECTIVE_DATE_LABEL}. Para seguir usando tu cuenta, revisa y acepta
          cada una. Guardamos qué versión aceptaste y cuándo.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <LegalConsentChecklist documents={pending} checked={checked} onChange={setChecked} idPrefix="gate" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" disabled={saving} onClick={() => void logout()}>
            Cerrar sesión
          </Button>
          <Button loading={saving} disabled={!allAccepted(pending, checked)} onClick={accept}>
            Aceptar y continuar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
