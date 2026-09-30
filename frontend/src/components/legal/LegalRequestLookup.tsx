'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { LEGAL_REQUEST_CATEGORY_LABELS, LEGAL_REQUEST_STATUS, type LegalRequestSummary } from '@/lib/legal-requests';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { dateStyle: 'long' });

/** Estado de una solicitud: exige el número y el correo con que se envió. */
export function LegalRequestLookup() {
  const searchParams = useSearchParams();
  const [ticket, setTicket] = useState(searchParams.get('solicitud') ?? '');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<LegalRequestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      setResult(await api.post<LegalRequestSummary>('/legal-requests/lookup', { ticket: ticket.trim(), email: email.trim() }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo consultar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const status = result ? LEGAL_REQUEST_STATUS[result.status] : null;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Número de solicitud"
            name="ticket"
            required
            placeholder="R-7KQ4M9XP"
            value={ticket}
            onChange={(e) => setTicket(e.target.value.toUpperCase())}
            maxLength={10}
            autoComplete="off"
          />
          <Input
            label="Correo con el que la enviaste"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={180}
          />
        </div>
        <Button type="submit" loading={loading} disabled={!ticket.trim() || !email.trim()}>
          Consultar
        </Button>
      </form>

      {result && status && (
        <section className="card space-y-3 p-6" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-lg font-semibold tracking-wider text-ink-950">{result.ticket}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-ink-500">Tipo</dt>
            <dd className="text-ink-900">{LEGAL_REQUEST_CATEGORY_LABELS[result.category]}</dd>
            <dt className="text-ink-500">Enviada</dt>
            <dd className="text-ink-900">{formatDate(result.createdAt)}</dd>
            {result.resolvedAt && (
              <>
                <dt className="text-ink-500">Respondida</dt>
                <dd className="text-ink-900">{formatDate(result.resolvedAt)}</dd>
              </>
            )}
          </dl>
          {result.resolution ? (
            <div className="rounded-lg border border-ink-100 bg-ink-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Respuesta</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink-800">{result.resolution}</p>
            </div>
          ) : (
            <p className="text-sm text-ink-600">Todavía no hay una respuesta. Te avisaremos por correo cuando la haya.</p>
          )}
        </section>
      )}
    </div>
  );
}
