'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { CONTACT_REQUEST_CONSENT_VERSION, contactRequestConsent } from '@/lib/legal';
import type { ContactChannel } from '@/lib/contact-requests';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';

interface Prefill {
  name: string | null;
  phone: string | null;
  email: string | null;
  emailVerified: boolean;
  identityVerified: boolean;
  days: number;
}

const PHONE = /^0(412|414|416|424|426)-?\d{7}$/;

/**
 * «Quiero que me contacte»: con la sesión de paciente, el formulario de la
 * ficha se completa con su cuenta y el paciente elige qué compartir. El médico
 * ve esos datos solo dentro del pedido y por un tiempo limitado.
 */
export function RequestContactForm({ professionalSlug, professionalName }: { professionalSlug: string; professionalName: string }) {
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [shareName, setShareName] = useState(true);
  const [sharePhone, setSharePhone] = useState(true);
  const [phone, setPhone] = useState('');
  const [shareEmail, setShareEmail] = useState(false);
  const [channel, setChannel] = useState<ContactChannel>('PHONE');
  const [preferredTime, setPreferredTime] = useState('');
  const [message, setMessage] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api
      .get<Prefill>('/contact/requests/prefill')
      .then((data) => {
        setPrefill(data);
        setShareName(!!data.name);
        setPhone(data.phone ?? '');
        setSharePhone(!!data.phone);
        setShareEmail(!data.phone);
        setChannel(data.phone ? 'PHONE' : 'EMAIL');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu cuenta'));
  }, []);

  const phoneChannel = channel === 'PHONE' || channel === 'WHATSAPP';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (phoneChannel && (!sharePhone || !PHONE.test(phone.trim()))) {
      setError('Para que te llame o te escriba por WhatsApp, comparte un teléfono válido (ej. 0414-1234567)');
      return;
    }
    if (channel === 'EMAIL' && !shareEmail) {
      setError('Para que te escriba, comparte tu correo');
      return;
    }
    setSending(true);
    try {
      await api.post('/contact/requests', {
        professionalSlug,
        shareName,
        phone: sharePhone && phone.trim() ? phone.trim() : undefined,
        shareEmail,
        channel,
        preferredTime: preferredTime.trim() || undefined,
        message: message.trim(),
        acceptConsent: accepted,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar el pedido');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Alert tone="success" title="Pedido enviado">
        Dr(a). {professionalName} verá solo lo que elegiste compartir durante {prefill?.days ?? 30} días. Puedes retirarlo
        cuando quieras en{' '}
        <Link href="/paciente/contactos" className="font-medium underline">
          Pedidos de contacto
        </Link>
        .
      </Alert>
    );
  }
  if (!prefill) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Quiero que me contacte">
      <p className="text-sm text-ink-600">
        Elige qué compartir con Dr(a). {professionalName}. Solo verá estos datos dentro de tu pedido.
        {prefill.identityVerified && ' Verá también que tu identidad está verificada.'}
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {!prefill.emailVerified && (
        <Alert tone="warning">Verifica tu correo para poder enviar el pedido (revisa tu bandeja de entrada).</Alert>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink-800">Qué compartes</legend>
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" className="mt-1" checked={shareName} disabled={!prefill.name} onChange={(e) => setShareName(e.target.checked)} />
          <span>Mi nombre{prefill.name ? `: ${prefill.name}` : ' (complétalo en tu perfil)'}</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" className="mt-1" checked={sharePhone} onChange={(e) => setSharePhone(e.target.checked)} />
          <span>Mi teléfono</span>
        </label>
        {sharePhone && (
          <Input label="Teléfono" placeholder="0414-1234567" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={13} />
        )}
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" className="mt-1" checked={shareEmail} onChange={(e) => setShareEmail(e.target.checked)} />
          <span>Mi correo: {prefill.email}</span>
        </label>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink-800">Cómo prefieres que te contacte</legend>
        <div className="flex flex-wrap gap-4 text-sm text-ink-700">
          {(
            [
              ['PHONE', 'Llamada'],
              ['WHATSAPP', 'WhatsApp'],
              ['EMAIL', 'Correo'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="canal" checked={channel === value} onChange={() => setChannel(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <Input
        label="Horario en que prefieres que te contacte (opcional)"
        placeholder="Ej. en las mañanas"
        maxLength={100}
        value={preferredTime}
        onChange={(e) => setPreferredTime(e.target.value)}
      />
      <Textarea
        label="Mensaje"
        required
        rows={4}
        minLength={10}
        maxLength={1000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        hint="No incluyas más información de salud de la necesaria. Este formulario no es para emergencias."
      />
      <label className="flex items-start gap-2 text-sm text-ink-800">
        <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>
          {contactRequestConsent(professionalName, prefill.days)}{' '}
          <span className="text-ink-500">(versión {CONTACT_REQUEST_CONSENT_VERSION})</span>
        </span>
      </label>
      <Button type="submit" loading={sending} disabled={!accepted || !prefill.emailVerified || message.trim().length < 10} className="w-full">
        Pedir que me contacte
      </Button>
    </form>
  );
}
