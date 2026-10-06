'use client';

import { Alert } from '@/components/ui/Alert';

/**
 * Lo que se está editando cambió en otro dispositivo (o lo cambió la
 * administración). No se pisan los cambios sin guardar: se ofrece cargar la
 * versión nueva cuando la persona quiera.
 */
export function RemoteChangeNotice({ onLoad }: { onLoad: () => void }) {
  return (
    <Alert tone="info">
      Estos datos cambiaron en otro dispositivo. Tus cambios sin guardar siguen aquí.{' '}
      <button type="button" onClick={onLoad} className="font-semibold text-pine-700 underline">
        Cargar la versión nueva
      </button>
    </Alert>
  );
}
