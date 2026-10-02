'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/dates';
import {
  NOTIFICATIONS_CHANGED,
  notificationsPathFor,
  safeNotificationLink,
  type NotificationItem,
  type NotificationPage,
} from '@/lib/notifications';

const POLL_MS = 60_000;
const PREVIEW = 8;

/** Campana de la cabecera: contador de no leídos y los avisos más recientes. */
export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // En el teléfono el panel ocupa el ancho de la pantalla, justo debajo de la campana.
  const [panelTop, setPanelTop] = useState(72);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  // No leídos: al entrar, cada minuto mientras la pestaña está a la vista y al volver a ella.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      api.get<{ count: number }>('/notifications/unread-count').then(
        (res) => {
          if (active) setCount(res.count);
        },
        () => undefined,
      );
    };
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    // La página «Notificaciones» avisa cuando marca algo como leído.
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [user]);

  // Se cierra con Escape o al tocar fuera.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (!user) return null;

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = button.current?.getBoundingClientRect();
    if (rect) setPanelTop(Math.round(rect.bottom + 8));
    setOpen(true);
    setFailed(false);
    api.get<NotificationPage>(`/notifications?limit=${PREVIEW}`).then(
      (page) => setItems(page.items),
      () => setFailed(true),
    );
  };

  const openItem = (item: NotificationItem) => {
    setOpen(false);
    if (!item.isRead) {
      setItems((list) => list?.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)) ?? null);
      setCount((c) => Math.max(0, c - 1));
      api.patch(`/notifications/${item.id}/read`).catch(() => undefined);
    }
    const link = safeNotificationLink(item.link);
    if (link) router.push(link);
  };

  const markAll = () => {
    setCount(0);
    setItems((list) => list?.map((n) => ({ ...n, isRead: true })) ?? null);
    api.patch('/notifications/read-all').catch(() => undefined);
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-label={count ? `Notificaciones: ${count} sin leer` : 'Notificaciones'}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative rounded-lg p-2 text-ink-700 hover:bg-ink-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 min-w-[1.15rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[1.15rem] text-white"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notificaciones"
          style={{ top: panelTop }}
          className="fixed inset-x-4 z-50 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:!top-full sm:mt-2 sm:w-[22rem]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notificaciones</p>
            {count > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-medium text-pine-700 hover:underline">
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {failed ? (
              <p className="px-4 py-6 text-sm text-ink-600">No se pudieron cargar tus notificaciones.</p>
            ) : items === null ? (
              <p className="px-4 py-6 text-sm text-ink-500">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-600">No tienes notificaciones.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-ink-50', !item.isRead && 'bg-pine-50/60')}
                    >
                      <span
                        aria-hidden="true"
                        className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', item.isRead ? 'bg-transparent' : 'bg-pine-600')}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink-900">
                          {item.title}
                          {!item.isRead && <span className="sr-only"> (sin leer)</span>}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-ink-600">{item.content}</span>
                        <span className="mt-1 block text-[11px] text-ink-500">{timeAgo(item.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-ink-100 px-4 py-2.5 text-right">
            <Link
              href={notificationsPathFor(user.role)}
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-pine-700 hover:underline"
            >
              Ver todas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
