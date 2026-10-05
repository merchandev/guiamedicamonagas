'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { LEGAL_REQUEST_CATEGORIES, isLegalRequestCategory, type LegalRequestCategory } from '@/lib/legal-requests';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

const DESCRIPTION_MIN = 20;

/**
 * Formulario del canal de reclamos. Sin sesión pide un correo para responder;
 * con sesión la solicitud queda a nombre de la cuenta. ?url= precarga el enlace. ?tipo= preselecciona
 * la categoría (enlaces desde las políticas y el panel del paciente).
 */
export function LegalRequestForm() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const tipo = searchParams.get('tipo');
  const [category, setCategory] = useState<LegalRequestCategory | ''>(isLegalRequestCategory(tipo) ? tipo : '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // ?url= llega desde «Denunciar» en una opinión: la ficha y la opinión de la que se trata.
  const [subjectUrl, setSubjectUrl] = useState(() => (searchParams.get('url') ?? '').slice(0, 300));
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);

  const selected = LEGAL_REQUEST_CATEGORIES.find((c) => c.value === category);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!category) return setError('Elige el tipo de solicitud');
    if (name.trim().length < 3) return setError('Escribe tu nombre');
    if (!user && !email.trim()) return setError('Escribe tu correo para poder responderte');
    if (description.trim().length < DESCRIPTION_MIN) {
      return setError(`Describe tu solicitud (mínimo ${DESCRIPTION_MIN} caracteres)`);
    }
    setSending(true);
    try {
      const body = {
        category,
        requesterName: name.trim(),
        requesterEmail: user ? undefined : email.trim(),
        requesterPhone: phone.trim() || undefined,
        subjectUrl: subjectUrl.trim() || undefined,
        description: description.trim(),
      };
      const result = await api.post<{ ticket: string }>(user ? '/legal-requests/me' : '/legal-requests', body);
      setTicket(result.ticket);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar la solicitud. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  };

  if (ticket) {
    return (
      <div id="formulario" className="card mt-8 scroll-mt-24 space-y-3 p-6" role="status">
        <h2 className="text-xl font-semibold text-ink-900">Recibimos tu solicitud</h2>
        <p className="text-sm text-ink-600">Este es tu número de seguimiento. Guárdalo: lo necesitas para consultar el estado.</p>
        <p className="select-all font-mono text-2xl font-semibold tracking-widest text-ink-950">{ticket}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={`/reclamos/estado?solicitud=${encodeURIComponent(ticket)}`} className="text-sm font-medium text-pine-700 underline">
            Consultar el estado de esta solicitud
          </Link>
        </div>
        <p className="text-xs text-ink-500">
          Te responderemos al correo {user ? 'de tu cuenta' : 'que indicaste'}. La respuesta también queda disponible en la
          consulta de estado.
        </p>
      </div>
    );
  }

  return (
    <form id="formulario" onSubmit={submit} className="card mt-8 scroll-mt-24 space-y-4 p-6" noValidate>
      <h2 className="text-xl font-semibold text-ink-900">Enviar una solicitud</h2>
      {error && <Alert tone="error">{error}</Alert>}

      <Select
        label="Tipo de solicitud"
        required
        value={category}
        onChange={(value) => setCategory(value as LegalRequestCategory)}
        options={LEGAL_REQUEST_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
        hint={selected?.hint}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Nombre y apellido" name="requesterName" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        {user ? (
          <Input label="Correo de respuesta" name="accountEmail" value={user.email} disabled readOnly hint="El de tu cuenta." />
        ) : (
          <Input
            label="Correo de respuesta"
            name="requesterEmail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={180}
          />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Teléfono (opcional)"
          name="requesterPhone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={20}
        />
        <Input
          label="Página o perfil relacionado (opcional)"
          name="subjectUrl"
          placeholder="https://…"
          value={subjectUrl}
          onChange={(e) => setSubjectUrl(e.target.value)}
          maxLength={300}
        />
      </div>

      <Textarea
        label="Describe tu solicitud"
        name="description"
        required
        rows={6}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={5000}
        hint="No incluyas contraseñas ni más datos de salud de los necesarios."
      />

      <p className="text-xs text-ink-500">
        Guardamos tu solicitud con su fecha, su categoría, su estado y la respuesta, y un dato técnico de seguridad (la
        dirección IP), para tramitarla y dejar constancia. Ver la{' '}
        <Link href="/privacidad" className="text-pine-700 underline">
          Política de privacidad
        </Link>
        .
      </p>

      <Button type="submit" loading={sending}>
        Enviar solicitud
      </Button>
    </form>
  );
}
