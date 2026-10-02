'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/dates';
import {
  NOTIFICATIONS_CHANGED,
  safeNotificationLink,
  type NotificationItem,
  type NotificationPage,
  type NotificationPreferences,
} from '@/lib/notifications';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';

const announce = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

/** Página «Notificaciones» de cualquier panel: todos los avisos y los correos opcionales. */
export function NotificationsCenter() {
  const router = useRouter();
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [savingType, setSavingType] = useState<string | null>(null);

  useEffect(() => {
    api.get<NotificationPage>('/notifications').then(setPage, (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus notificaciones.'),
    );
    api.get<NotificationPreferences>('/notifications/preferences').then(setPrefs, () =>
      setPrefsError('No se pudieron cargar tus preferencias de correo.'),
    );
  }, []);

  const loadMore = () => {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    api
      .get<NotificationPage>(`/notifications?cursor=${encodeURIComponent(page.nextCursor)}`)
      .then(
        (next) => setPage((current) => ({ items: [...(current?.items ?? []), ...next.items], nextCursor: next.nextCursor })),
        () => setError('No se pudieron cargar las notificaciones anteriores.'),
      )
      .finally(() => setLoadingMore(false));
  };

  const markRead = (item: NotificationItem) => {
    if (item.isRead) return;
    setPage((current) => current && { ...current, items: current.items.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)) });
    api.patch(`/notifications/${item.id}/read`).then(announce, () => undefined);
  };

  const openItem = (item: NotificationItem) => {
    markRead(item);
    const link = safeNotificationLink(item.link);
    if (link) router.push(link);
  };

  const markAll = () => {
    setPage((current) => current && { ...current, items: current.items.map((n) => ({ ...n, isRead: true })) });
    api.patch('/notifications/read-all').then(announce, () => setError('No se pudieron marcar como leídas.'));
  };

  const toggleEmail = (type: string, enabled: boolean) => {
    if (!prefs) return;
    const next = prefs.email.map((p) => (p.type === type ? { ...p, enabled } : p));
    setSavingType(type);
    setPrefsError(null);
    api
      .put<NotificationPreferences>('/notifications/preferences', {
        emailOptOut: next.filter((p) => !p.enabled).map((p) => p.type),
      })
      .then(setPrefs, () => setPrefsError('No se pudo guardar el cambio.'))
      .finally(() => setSavingType(null));
  };

  const hasUnread = !!page?.items.some((n) => !n.isRead);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Notificaciones</h1>
        {hasUnread && (
          <Button variant="outline" size="sm" onClick={markAll}>
            Marcar todas como leídas
          </Button>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {!page ? (
        !error && <PageSpinner />
      ) : page.items.length === 0 ? (
        <EmptyState
          title="No tienes notificaciones"
          description="Aquí verás los avisos de tu cuenta: citas, documentos, pagos y más."
        />
      ) : (
        <div className="card divide-y divide-ink-100">
          {page.items.map((item) => (
            <article key={item.id} className={cn('flex gap-3 p-4', !item.isRead && 'bg-pine-50/50')}>
              <span
                aria-hidden="true"
                className={cn('mt-2 h-2 w-2 flex-shrink-0 rounded-full', item.isRead ? 'bg-transparent' : 'bg-pine-600')}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-ink-900">
                  {item.title}
                  {!item.isRead && <span className="sr-only"> (sin leer)</span>}
                </h2>
                <p className="mt-1 break-words text-sm text-ink-700">{item.content}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {formatDateTime(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {safeNotificationLink(item.link) && (
                    <button type="button" onClick={() => openItem(item)} className="text-sm font-medium text-pine-700 hover:underline">
                      Ver
                    </button>
                  )}
                  {!item.isRead && (
                    <button type="button" onClick={() => markRead(item)} className="text-sm font-medium text-ink-600 hover:underline">
                      Marcar como leída
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
          {page.nextCursor && (
            <div className="p-4 text-center">
              <Button variant="ghost" size="sm" loading={loadingMore} onClick={loadMore}>
                Ver anteriores
              </Button>
            </div>
          )}
        </div>
      )}

      <section className="card space-y-4 p-6" aria-labelledby="avisos-por-correo">
        <h2 id="avisos-por-correo" className="text-lg font-semibold text-ink-900">
          Avisos por correo
        </h2>
        <p className="text-sm text-ink-600">
          Los avisos de seguridad, de tu cuenta, de verificación, de pagos y de cambios en tus citas siempre llegan también
          por correo. Estos puedes apagarlos: los seguirás viendo aquí.
        </p>
        {prefsError && <Alert tone="error">{prefsError}</Alert>}
        {prefs === null ? (
          !prefsError && <Spinner />
        ) : prefs.email.length === 0 ? (
          <p className="text-sm text-ink-500">Tu tipo de cuenta no tiene correos opcionales.</p>
        ) : (
          <div className="space-y-3">
            {prefs.email.map((p) => (
              <Switch
                key={p.type}
                id={`correo-${p.type}`}
                checked={p.enabled}
                disabled={savingType === p.type}
                onChange={(enabled) => toggleEmail(p.type, enabled)}
                label={p.label}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
