'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useRealtimeRefresh } from '@/lib/realtime';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDate, formatDateTime } from '@/lib/dates';
import { CONTACT_CHANNEL_LABEL, CONTACT_REQUEST_STATUS, type ContactChannel, type ContactRequestStatus } from '@/lib/contact-requests';

interface ContactMessage {
  id: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
  /** Solo en los pedidos «Quiero que me contacte» de un paciente con sesión. */
  requestStatus: ContactRequestStatus | null;
  preferredChannel: ContactChannel | null;
  preferredTime: string | null;
  identityVerified: boolean;
  expiresAt: string | null;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<ContactMessage[]>('/contact/me')
      .then(setMessages)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los mensajes'));
  }, []);

  useEffect(load, [load]);
  useRealtimeRefresh(['contact'], load);

  const markRead = async (id: string) => {
    await api.patch(`/contact/${id}/read`).catch(() => undefined);
    load();
  };

  const setStatus = async (id: string, status: 'CONTACTED' | 'CLOSED') => {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/contact/requests/${id}/status`, { status });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo actualizar el pedido');
    } finally {
      setBusyId(null);
    }
  };

  if (!messages) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Mensajes de pacientes</h1>
        <p className="mt-1 text-sm text-ink-600">
          Los pedidos «Quiero que me contacte» traen solo los datos que el paciente eligió compartir: úsalos solo para
          responder ese pedido. Se borran a los 30 días o cuando el paciente lo retira.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {messages.length === 0 ? (
        <EmptyState title="Aún no tienes mensajes" description="Aparecerán aquí cuando alguien te escriba desde tu perfil público." />
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (m.requestStatus ? <RequestCard key={m.id} request={m} busy={busyId === m.id} onStatus={setStatus} /> : <MessageCard key={m.id} message={m} onRead={markRead} />))}
        </div>
      )}
    </div>
  );
}

function MessageCard({ message: m, onRead }: { message: ContactMessage; onRead: (id: string) => void }) {
  return (
    <div
      className="card p-5"
      // Un mensaje nuevo se marca como leído con clic o con Enter/Espacio.
      role={m.isRead ? undefined : 'button'}
      tabIndex={m.isRead ? undefined : 0}
      aria-label={m.isRead ? undefined : `Mensaje nuevo de ${m.senderName}: marcar como leído`}
      onClick={() => !m.isRead && onRead(m.id)}
      onKeyDown={(e) => {
        if (!m.isRead && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onRead(m.id);
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink-900">{m.senderName}</p>
        <div className="flex items-center gap-2">
          {!m.isRead && <Badge tone="gold">Nuevo</Badge>}
          <span className="text-xs text-ink-500">{formatDateTime(m.createdAt)}</span>
        </div>
      </div>
      <p className="text-sm text-ink-500">
        {m.senderEmail}
        {m.senderPhone ? ` · ${m.senderPhone}` : ''}
      </p>
      <p className="mt-2 text-sm text-ink-700">{m.content}</p>
    </div>
  );
}

function RequestCard({
  request: r,
  busy,
  onStatus,
}: {
  request: ContactMessage;
  busy: boolean;
  onStatus: (id: string, status: 'CONTACTED' | 'CLOSED') => void;
}) {
  const status = r.requestStatus!;
  const erased = status === 'WITHDRAWN' || status === 'EXPIRED';
  return (
    <article className="card space-y-2 p-5" aria-label={`Pedido de contacto de ${erased ? 'un paciente' : r.senderName}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink-900">{erased ? 'Pedido de contacto' : r.senderName}</p>
          <Badge tone="pine">Quiero que me contacte</Badge>
          {r.identityVerified && !erased && <Badge tone="neutral">Identidad verificada</Badge>}
          <Badge tone={CONTACT_REQUEST_STATUS[status].tone}>{CONTACT_REQUEST_STATUS[status].label}</Badge>
        </div>
        <span className="text-xs text-ink-500">{formatDateTime(r.createdAt)}</span>
      </div>
      {erased ? (
        <p className="text-sm text-ink-600">
          {status === 'WITHDRAWN'
            ? 'El paciente retiró el pedido: sus datos se borraron.'
            : 'El pedido venció a los 30 días: los datos del paciente se borraron.'}
        </p>
      ) : (
        <>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {r.preferredChannel && (
              <div>
                <dt className="inline text-ink-500">Prefiere: </dt>
                <dd className="inline text-ink-800">{CONTACT_CHANNEL_LABEL[r.preferredChannel]}</dd>
              </div>
            )}
            {r.senderPhone && (
              <div>
                <dt className="inline text-ink-500">Teléfono: </dt>
                <dd className="inline text-ink-800">{r.senderPhone}</dd>
              </div>
            )}
            {r.senderEmail && (
              <div>
                <dt className="inline text-ink-500">Correo: </dt>
                <dd className="inline text-ink-800">{r.senderEmail}</dd>
              </div>
            )}
            {r.preferredTime && (
              <div>
                <dt className="inline text-ink-500">Horario: </dt>
                <dd className="inline text-ink-800">{r.preferredTime}</dd>
              </div>
            )}
          </dl>
          <p className="whitespace-pre-wrap text-sm text-ink-700">{r.content}</p>
          {r.expiresAt && (
            <p className="text-xs text-ink-500">Los datos se borran el {formatDate(r.expiresAt, { dateStyle: 'long' })}.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {status === 'OPEN' && (
              <Button size="sm" loading={busy} onClick={() => onStatus(r.id, 'CONTACTED')}>
                Marcar como contactado
              </Button>
            )}
            {(status === 'OPEN' || status === 'CONTACTED') && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus(r.id, 'CLOSED')}>
                Cerrar el pedido
              </Button>
            )}
          </div>
        </>
      )}
    </article>
  );
}
