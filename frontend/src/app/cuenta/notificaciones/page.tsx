'use client';

import { RequireAuth } from '@/components/RequireAuth';
import { NotificationsCenter } from '@/components/notifications/NotificationsCenter';

// Para las cuentas sin un panel propio con menú (organizaciones); las demás
// tienen la página dentro de su panel.
export default function CuentaNotificacionesPage() {
  return (
    <RequireAuth>
      <div className="container-page max-w-3xl py-10">
        <NotificationsCenter />
      </div>
    </RequireAuth>
  );
}
