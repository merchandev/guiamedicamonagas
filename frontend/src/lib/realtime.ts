'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, getAccessToken, refreshAccessToken } from './api';

/**
 * Sincronización en tiempo real con la API (Socket.IO en /api/v1/realtime).
 *
 * El canal solo avisa «cambió algo de este tema»; cada página vuelve a pedir
 * sus datos a la API con su sesión de siempre. Al conectarse (o reconectarse)
 * se avisa de todo, porque mientras no hubo conexión pudo cambiar cualquier
 * cosa. Temas: ver backend/src/realtime/realtime-audience.ts.
 */
export type RealtimeTopic =
  | 'appointments'
  | 'schedule'
  | 'availability'
  | 'notifications'
  | 'contact'
  | 'prescriptions'
  | 'documents'
  | 'profile'
  | 'directory'
  | 'posts'
  | 'billing'
  | 'reviews'
  | 'access'
  | 'patientProfile'
  | 'identities'
  | 'clinical'
  | 'finance'
  | 'account'
  | 'requests'
  | 'organization'
  | 'catalog';

export type RealtimeStatus = 'off' | 'connecting' | 'live';

/** Evento de ventana: la sesión de esta cuenta cambió en otro lado (revisar /auth/me). */
export const SESSION_CHANGED = 'gmm:session-changed';

interface SyncMessage {
  topics: RealtimeTopic[];
}
type Listener = (changed: ReadonlySet<RealtimeTopic> | 'all') => void;

let socket: Socket | null = null;
let status: RealtimeStatus = 'off';
const listeners = new Set<Listener>();
const statusListeners = new Set<() => void>();
/** Médicos cuyos horarios públicos se están mirando (con cuántas pantallas). */
const watched = new Map<string, number>();

function setStatus(next: RealtimeStatus) {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => listener());
}

function notify(changed: ReadonlySet<RealtimeTopic> | 'all') {
  listeners.forEach((listener) => listener(changed));
}

function endpoint() {
  const base = new URL(API_URL, window.location.href);
  return { origin: base.origin, path: `${base.pathname.replace(/\/$/, '')}/realtime` };
}

async function reauthenticate() {
  const token = await refreshAccessToken().catch(() => null);
  if (token && socket) window.setTimeout(() => socket?.connect(), 1000);
  else stopRealtime();
}

/** Conecta el canal con la sesión actual. Lo llama AuthProvider al iniciar sesión. */
export function startRealtime() {
  if (socket || typeof window === 'undefined') return;
  const { origin, path } = endpoint();
  socket = io(origin, {
    path,
    // Si un proxy no deja pasar WebSocket, Socket.IO sigue por HTTP.
    transports: ['websocket', 'polling'],
    auth: (send) => send({ token: getAccessToken() ?? undefined }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
  });
  setStatus('connecting');
  socket.on('ready', () => {
    setStatus('live');
    watched.forEach((_, professionalId) => socket?.emit('watch', { professionalId }));
    notify('all');
  });
  socket.on('sync', (message: SyncMessage) => notify(new Set(message.topics)));
  socket.on('session', () => window.dispatchEvent(new Event(SESSION_CHANGED)));
  socket.on('connect_error', (error) => {
    setStatus('connecting');
    // Un token vencido: se renueva y se vuelve a intentar (sin sesión, se apaga).
    if (error.message === 'unauthorized') void reauthenticate();
  });
  socket.on('disconnect', (reason) => {
    setStatus('connecting');
    // El servidor cortó la conexión (p. ej. cambió la sesión): se reconecta con el token vigente.
    if (reason === 'io server disconnect') window.setTimeout(() => socket?.connect(), 1500);
  });
}

export function stopRealtime() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  setStatus('off');
}

/**
 * Vuelve a cargar los datos de la pantalla cuando otro dispositivo (o la
 * administración, o una tarea programada) cambia algo de estos temas, y al
 * reconectarse. `refresh` debe actualizar sin vaciar lo que ya se ve.
 */
export function useRealtimeRefresh(topics: readonly RealtimeTopic[], refresh: () => unknown, enabled = true) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });
  const topicsKey = topics.join(',');
  useEffect(() => {
    if (!enabled) return;
    const wanted = topicsKey.split(',') as RealtimeTopic[];
    let timer: number | undefined;
    const listener: Listener = (changed) => {
      if (changed !== 'all' && !wanted.some((topic) => changed.has(topic))) return;
      // Junta los avisos seguidos (p. ej. una cita y su aviso) en una sola recarga.
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void latest.current(), 300);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      window.clearTimeout(timer);
    };
  }, [topicsKey, enabled]);
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(subscribeStatus, () => status, () => 'off');
}

/** Mientras la pantalla está abierta, avisa cuando cambian los horarios libres de ese médico. */
export function useWatchProfessional(professionalId: string | null | undefined) {
  useEffect(() => {
    if (!professionalId) return;
    watched.set(professionalId, (watched.get(professionalId) ?? 0) + 1);
    if (status === 'live') socket?.emit('watch', { professionalId });
    return () => {
      const remaining = (watched.get(professionalId) ?? 1) - 1;
      if (remaining > 0) {
        watched.set(professionalId, remaining);
      } else {
        watched.delete(professionalId);
        socket?.emit('unwatch', { professionalId });
      }
    };
  }, [professionalId]);
}
