import type { Role } from '@/lib/auth-context';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  content: string;
  /** Ruta interna del sitio a la que lleva el aviso. */
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
}

export interface NotificationPreferences {
  email: { type: string; label: string; enabled: boolean }[];
}

/** Evento de ventana: algo se marcó como leído y la campana debe actualizar su contador. */
export const NOTIFICATIONS_CHANGED = 'gmm:notifications-changed';

/** Página «Notificaciones» dentro del panel de cada tipo de cuenta. */
export function notificationsPathFor(role: Role): string {
  if (role === 'PROFESSIONAL') return '/dashboard/notificaciones';
  if (role === 'USER') return '/paciente/notificaciones';
  if (role === 'ADMIN' || role === 'SUPERADMIN') return '/admin/notificaciones';
  return '/cuenta/notificaciones';
}

/** Solo rutas internas: un enlace a otra web nunca se sigue desde un aviso. */
export function safeNotificationLink(link: string | null): string | null {
  return link && link.startsWith('/') && !link.startsWith('//') ? link : null;
}
