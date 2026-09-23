'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { ProfessionalDetail } from '@/lib/types';

function nextDays(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
}

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AgendarCitaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [doctor, setDoctor] = useState<ProfessionalDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const days = nextDays(14);
  const [selectedDay, setSelectedDay] = useState(dateKey(days[0]));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ reason: '', firstName: '', lastName: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<ProfessionalDetail>(`/professionals/${slug}`)
      .then(setDoctor)
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!doctor) return;
    setSelectedSlot(null);
    api
      .get<string[]>(`/appointments/availability?professionalId=${doctor.id}&from=${selectedDay}&to=${selectedDay}`)
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [doctor, selectedDay]);

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctor || !selectedSlot) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/appointments', {
        professionalId: doctor.id,
        startsAt: selectedSlot,
        reason: form.reason || undefined,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        phone: form.phone || undefined,
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo agendar la cita');
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className="container-page py-10">
        <Alert tone="error">Médico no encontrado.</Alert>
      </div>
    );
  }

  return (
    <RequireAuth>
      <div className="container-page max-w-2xl py-10">
        {!doctor ? (
          <PageSpinner />
        ) : !doctor.bookingEnabled ? (
          <Alert tone="warning">Este médico no tiene citas disponibles por ahora.</Alert>
        ) : success ? (
          <div className="card p-8 text-center">
            <h1 className="text-2xl text-ink-950">¡Solicitud enviada!</h1>
            <p className="mt-2 text-ink-600">
              Te avisaremos por correo en cuanto Dr(a). {doctor.firstName} {doctor.lastName} confirme tu cita.
            </p>
            <Button className="mt-6" onClick={() => router.push('/dashboard')}>
              Ver mis citas
            </Button>
          </div>
        ) : (
          <form onSubmit={book} className="card space-y-6 p-6">
            <div>
              <h1 className="text-2xl text-ink-950">
                Agendar con Dr(a). {doctor.firstName} {doctor.lastName}
              </h1>
              <p className="mt-1 text-sm text-pine-700">
                {doctor.specialties.map((s) => s.specialty.name).join(', ') || 'Medicina General'}
              </p>
            </div>
            {error && <Alert tone="error">{error}</Alert>}

            <div>
              <p className="field-label">Fecha</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {days.map((d) => {
                  const key = dateKey(d);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDay(key)}
                      className={`flex-shrink-0 rounded-lg border px-3 py-2 text-xs ${
                        selectedDay === key ? 'border-pine-700 bg-pine-700 text-white' : 'border-ink-200 text-ink-600'
                      }`}
                    >
                      {d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="field-label">Hora</p>
              {slots === null ? (
                <PageSpinner />
              ) : slots.length === 0 ? (
                <p className="text-sm text-ink-500">No hay horarios disponibles ese día.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-lg border px-2 py-2 text-sm ${
                        selectedSlot === slot ? 'border-pine-700 bg-pine-700 text-white' : 'border-ink-200 text-ink-700'
                      }`}
                    >
                      {new Date(slot).toLocaleTimeString('es-VE', { timeStyle: 'short' })}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Textarea
              label="Motivo de consulta (opcional)"
              rows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />

            <div className="space-y-3 border-t border-ink-100 pt-4">
              <p className="text-sm text-ink-600">Solo si es tu primera reserva con nosotros:</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Nombres"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
                <Input
                  label="Apellidos"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
              <Input
                label="Teléfono"
                placeholder="0414-1234567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <Button type="submit" loading={submitting} disabled={!selectedSlot} className="w-full">
              Solicitar cita
            </Button>
          </form>
        )}
      </div>
    </RequireAuth>
  );
}
