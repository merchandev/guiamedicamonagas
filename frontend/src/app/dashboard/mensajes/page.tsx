'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';

interface ContactMessage {
  id: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);

  const load = () => api.get<ContactMessage[]>('/contact/me').then(setMessages);

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id: string) => {
    await api.patch(`/contact/${id}/read`).catch(() => undefined);
    load();
  };

  if (!messages) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Mensajes de pacientes</h1>
      {messages.length === 0 ? (
        <EmptyState title="Aún no tienes mensajes" description="Aparecerán aquí cuando alguien te escriba desde tu perfil público." />
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="card p-5" onClick={() => !m.isRead && markRead(m.id)}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink-900">{m.senderName}</p>
                <div className="flex items-center gap-2">
                  {!m.isRead && <Badge tone="gold">Nuevo</Badge>}
                  <span className="text-xs text-ink-400">{new Date(m.createdAt).toLocaleString('es-VE')}</span>
                </div>
              </div>
              <p className="text-sm text-ink-500">
                {m.senderEmail}
                {m.senderPhone ? ` · ${m.senderPhone}` : ''}
              </p>
              <p className="mt-2 text-sm text-ink-700">{m.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
