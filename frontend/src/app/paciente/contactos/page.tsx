'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useRealtimeRefresh } from '@/lib/realtime';
import { formatDate } from '@/lib/dates';
import { CONTACT_CHANNEL_LABEL, CONTACT_REQUEST_STATUS, type ContactChannel, type ContactRequestStatus } from '@/lib/contact-requests';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';

interface ContactRequest {
  id: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string | null;
  content: string;
  preferredChannel: ContactChannel | null;
  preferredTime: string | null;
  identityVerified: boolean;
  requestStatus: ContactRequestStatus;
  createdAt: string;
  expiresAt: string | null;
  professional: { slug: string; name: string };
}

const ACTIVE: ContactRequestStatus[] = ['OPEN', 'CONTACTED', 'CLOSED'];

export default function PatientContactRequestsPage() {
  const [items, setItems] = useState<ContactRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<ContactRequest[]>('/contact/requests/me')
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus pedidos'));
  }, []);

  useEffect(load, [load]);
  useRealtimeRefresh(['contact'], load);

  const withdraw = async (request: ContactRequest) => {
    if (!window.confirm(`¿Retirar tu pedido a Dr(a). ${request.professional.name}? Dejará de ver tus datos al instante.`)) return;
    setBusyId(request.id);
    setError(null);
    try {
      await api.patch(`/contact/requests/${request.id}/withdraw`);
      setNotice('Retiraste el pedido: el médico ya no ve tus datos.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo retirar el pedido');
    } finally {
      setBusyId(null);
    }
  };

  if (!items) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Pedidos de contacto</h1>
        <p className="mt-1 text-sm text-ink-600">
          Los médicos a los que pediste que te contacten desde su ficha. Cada uno ve solo lo que elegiste compartir, durante
          30 días o hasta que retires el pedido; después tus datos se borran del pedido.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {items.length === 0 ? (
        <EmptyState
          title="No has pedido que te contacten"
          description="En la ficha de un médico que recibe mensajes, inicia sesión y usa «Pedir que me contacte»."
        />
      ) : (
        <div className="space-y-3">
          {items.map((request) => {
            const active = ACTIVE.includes(request.requestStatus);
            return (
              <article key={request.id} className="card space-y-2 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/medicos/${request.professional.slug}`} className="font-semibold text-ink-900 hover:underline">
                    Dr(a). {request.professional.name}
                  </Link>
                  <Badge tone={CONTACT_REQUEST_STATUS[request.requestStatus].tone}>{CONTACT_REQUEST_STATUS[request.requestStatus].label}</Badge>
                </div>
                <p className="text-xs text-ink-500">
                  Enviado el {formatDate(request.createdAt, { dateStyle: 'long' })}
                  {active && request.expiresAt ? ` · tus datos se borran el ${formatDate(request.expiresAt, { dateStyle: 'long' })}` : ''}
                </p>
                {active ? (
                  <>
                    <p className="text-sm text-ink-700">
                      Compartiste: {request.senderName !== 'Paciente' ? `tu nombre (${request.senderName})` : 'sin tu nombre'}
                      {request.senderPhone ? `, tu teléfono ${request.senderPhone}` : ''}
                      {request.senderEmail ? `, tu correo ${request.senderEmail}` : ''}
                      {request.preferredChannel ? `. Prefieres: ${CONTACT_CHANNEL_LABEL[request.preferredChannel].toLocaleLowerCase('es-VE')}` : ''}
                      {request.preferredTime ? `, ${request.preferredTime}` : ''}.
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-ink-600">{request.content}</p>
                    <Button size="sm" variant="outline" loading={busyId === request.id} onClick={() => void withdraw(request)}>
                      Retirar el pedido
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-ink-600">
                    {request.requestStatus === 'WITHDRAWN' ? 'Lo retiraste' : 'Venció'}: tus datos se borraron del pedido.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
