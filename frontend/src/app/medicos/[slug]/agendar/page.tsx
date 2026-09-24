'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { ProfessionalDetail } from '@/lib/types';
import { ALL_SCOPES, SCOPE_INFO, type PatientDataScope } from '@/lib/patient-scopes';
import { PATIENT_CONSENT_VERSION } from '@/lib/legal';

function nextDays(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Día de calendario en Caracas (toISOString daría la fecha UTC: después de las
// 8 p.m. en Venezuela ya sería "mañana").
function dateKey(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
}

interface OwnPatientProfile {
  firstName: string | null;
  lastName: string | null;
  patientCode: string;
  phone: string | null;
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
  // Consentimiento opcional: nada viene marcado por defecto.
  const [shareScopes, setShareScopes] = useState<PatientDataScope[]>([]);
  const [shareDays, setShareDays] = useState(30);
  // Ficha de paciente ya creada (al registrarse o en una reserva anterior):
  // undefined = cargando, null = primera reserva sin ficha.
  const [ownProfile, setOwnProfile] = useState<OwnPatientProfile | null | undefined>(undefined);

  useEffect(() => {
    api
      .get<OwnPatientProfile>('/patients/me')
      .then(setOwnProfile)
      .catch(() => setOwnProfile(null));
  }, []);

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
        shareScopes: shareScopes.length ? shareScopes : undefined,
        shareDays: shareScopes.length ? shareDays : undefined,
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
            <Button className="mt-6" onClick={() => router.push('/paciente/citas')}>
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
                      {d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Caracas' })}
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
                      {new Date(slot).toLocaleTimeString('es-VE', { timeStyle: 'short', timeZone: 'America/Caracas' })}
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

            {ownProfile ? (
              <div className="rounded-lg border border-ink-100 bg-ink-50 p-4 text-sm text-ink-700">
                Reservas como{' '}
                <strong>
                  {ownProfile.firstName} {ownProfile.lastName}
                </strong>{' '}
                ({ownProfile.patientCode}){ownProfile.phone ? <> · {ownProfile.phone}</> : null}. Para cambiar tu teléfono u
                otros datos, ve a{' '}
                <Link href="/paciente" className="font-medium text-pine-700 underline">
                  tu perfil
                </Link>
                .
              </div>
            ) : ownProfile === null ? (
              <div className="space-y-3 border-t border-ink-100 pt-4">
                <p className="text-sm text-ink-600">Es tu primera reserva: ¿a nombre de quién va la cita?</p>
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
            ) : null}

            <fieldset className="space-y-2 border-t border-ink-100 pt-4">
              <legend className="field-label">
                Opcional: ¿qué puede ver Dr(a). {doctor.lastName} antes de la consulta?
              </legend>
              <p className="text-xs text-ink-500">
                Si no marcas nada, solo verá tu código de paciente. Puedes revocar esta autorización cuando quieras desde
                «Permisos» en tu panel. Tu cédula nunca se comparte.
              </p>
              {ALL_SCOPES.map((scope) => (
                <label key={scope} className="flex items-start gap-3 rounded-lg border border-ink-100 p-3">
                  <input
                    type="checkbox"
                    checked={shareScopes.includes(scope)}
                    onChange={() =>
                      setShareScopes((current) =>
                        current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
                      )
                    }
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pine-700 focus:ring-pine-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink-900">{SCOPE_INFO[scope].label}</span>
                    <span className="block text-xs text-ink-500">{SCOPE_INFO[scope].description}</span>
                  </span>
                </label>
              ))}
              {shareScopes.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-ink-600">
                  Durante
                  <select
                    value={shareDays}
                    onChange={(e) => setShareDays(Number(e.target.value))}
                    className="h-9 rounded-lg border-ink-200 text-sm"
                  >
                    <option value={7}>7 días</option>
                    <option value={30}>30 días</option>
                    <option value={90}>90 días</option>
                  </select>
                  <span className="text-xs text-ink-400">Consentimiento v{PATIENT_CONSENT_VERSION}</span>
                </label>
              )}
            </fieldset>

            <Button type="submit" loading={submitting} disabled={!selectedSlot} className="w-full">
              Solicitar cita
            </Button>
          </form>
        )}
      </div>
    </RequireAuth>
  );
}
