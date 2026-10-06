'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, apiBlob, ApiError } from '@/lib/api';
import { useRealtimeRefresh } from '@/lib/realtime';
import { formatDate, formatDateTime } from '@/lib/dates';
import type { DirectoryPatient, DoctorPrescription } from '@/lib/prescriptions';
import { PrescriptionPaper } from '@/components/prescriptions/PrescriptionPaper';
import { PrescriptionShare } from '@/components/prescriptions/PrescriptionShare';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';

export default function DoctorPrescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const [prescription, setPrescription] = useState<DoctorPrescription | null>(null);
  const [patients, setPatients] = useState<DirectoryPatient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [deliverTo, setDeliverTo] = useState('');
  const [delivering, setDelivering] = useState(false);
  const [annulReason, setAnnulReason] = useState('');
  const [annulling, setAnnulling] = useState(false);

  useEffect(() => {
    api.get<DoctorPrescription>(`/prescriptions/${id}`).then(setPrescription, (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el récipe'),
    );
  }, [id]);
      useRealtimeRefresh(['prescriptions'], () => api.get<DoctorPrescription>(`/prescriptions/${id}`).then(setPrescription, () => undefined));

  const loadPatients = useCallback(() => {
    api.get<DirectoryPatient[]>('/prescriptions/patients').then(setPatients, () => setPatients([]));
  }, []);

  const act = async (action: () => Promise<DoctorPrescription | void>, done: string, fallback: string) => {
    setError(null);
    setNotice(null);
    try {
      const updated = await action();
      if (updated) setPrescription(updated);
      setNotice(done);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : fallback);
      return false;
    }
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!to || !window.confirm(`¿Enviar el récipe con el PDF adjunto a ${to}? Revisa bien el correo: lleva datos de salud.`)) return;
    setSending(true);
    const ok = await act(
      async () => {
        const result = await api.post<{ sent: boolean; emailsLeft: number }>(`/prescriptions/${id}/email`, { email: to });
        setPrescription((current) => (current ? { ...current, emailsSent: current.emailsSent + 1, emailsLeft: result.emailsLeft } : current));
      },
      `Enviamos el récipe a ${to}.`,
      'No se pudo enviar el correo',
    );
    if (ok) setEmail('');
    setSending(false);
  };

  const deliver = async () => {
    if (!deliverTo) return;
    setDelivering(true);
    await act(
      () => api.post<DoctorPrescription>(`/prescriptions/${id}/deliver`, { patientId: deliverTo }),
      'Listo: el paciente ya lo tiene en «Mis récipes» y recibió un aviso.',
      'No se pudo entregar el récipe',
    );
    setDelivering(false);
  };

  const annul = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm('¿Anular este récipe? Dejará de servir en la farmacia y no se puede deshacer.')) return;
    setAnnulling(true);
    await act(
      () => api.post<DoctorPrescription>(`/prescriptions/${id}/annul`, { reason: annulReason }),
      'Anulaste el récipe. La verificación con su código ahora lo muestra como anulado.',
      'No se pudo anular el récipe',
    );
    setAnnulling(false);
  };

  if (!prescription) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  const active = prescription.status !== 'ANNULLED';
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/recipes" className="text-sm text-pine-700 hover:underline">
            ← Récipes
          </Link>
          <h1 className="mt-1 text-2xl">Récipe N° {prescription.numberLabel}</h1>
          <p className="mt-1 text-sm text-ink-600">
            Emitido el {formatDateTime(prescription.issuedAt, { dateStyle: 'long', timeStyle: 'short' })} para {prescription.content.patient.fullName}.
          </p>
        </div>
        <Link
          href={`/dashboard/recipes/nuevo?desde=${prescription.id}`}
          className="inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50"
        >
          Usar como base para uno nuevo
        </Link>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {prescription.status === 'ANNULLED' && (
        <Alert tone="warning" title="Récipe anulado">
          {prescription.annulledAt ? `El ${formatDate(prescription.annulledAt, { dateStyle: 'long' })}. ` : ''}Motivo: {prescription.annulReason}
        </Alert>
      )}
      {prescription.status === 'EXPIRED' && <Alert tone="warning">Este récipe venció: ya no sirve para comprar medicamentos.</Alert>}

      <PrescriptionShare view={prescription} downloadPdf={() => apiBlob(`/prescriptions/${id}/pdf`)} askPhone />

      {prescription.status === 'VALID' && (
        <form onSubmit={sendEmail} aria-labelledby="rx-correo" className="card space-y-3 p-5">
          <h2 id="rx-correo" className="text-lg font-semibold text-ink-900">
            Enviar por correo
          </h2>
          <p className="text-sm text-ink-600">
            Lo enviamos con el PDF adjunto y el código de verificación al correo que indiques (el del paciente o el de quien lo
            represente). Te quedan {prescription.emailsLeft} envíos para este récipe.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full sm:w-80">
              <Input
                label="Correo"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={prescription.emailsLeft === 0}
              />
            </div>
            <Button type="submit" loading={sending} disabled={prescription.emailsLeft === 0 || !email.trim()}>
              Enviar
            </Button>
          </div>
        </form>
      )}

      <section aria-labelledby="rx-plataforma" className="card space-y-3 p-5">
        <h2 id="rx-plataforma" className="text-lg font-semibold text-ink-900">
          En la plataforma
        </h2>
        {prescription.deliveredTo ? (
          <p className="text-sm text-ink-700">
            Está en «Mis récipes» del paciente <span className="font-mono">{prescription.deliveredTo}</span>
            {prescription.deliveredAt ? ` desde el ${formatDate(prescription.deliveredAt, { dateStyle: 'long' })}` : ''}.
          </p>
        ) : !active ? (
          <p className="text-sm text-ink-700">No está en la cuenta de ningún paciente.</p>
        ) : (
          <>
            <p className="text-sm text-ink-700">
              Aún no está en la cuenta de ningún paciente. El paciente puede agregarlo con su código desde «Mis récipes» (si la
              cédula del récipe es la suya), o puedes entregárselo tú si está en tu directorio.
            </p>
            {patients === null ? (
              <Button variant="outline" size="sm" onClick={loadPatients}>
                Elegir un paciente de mi directorio
              </Button>
            ) : patients.length === 0 ? (
              <p className="text-sm text-ink-600">No tienes pacientes con cuenta en tu directorio.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-full sm:w-80">
                  <Select
                    label="Paciente"
                    value={deliverTo}
                    onChange={setDeliverTo}
                    options={patients.map((p) => ({ value: p.patientId, label: p.name ? `${p.name} · ${p.patientCode}` : p.patientCode }))}
                  />
                </div>
                <Button onClick={() => void deliver()} loading={delivering} disabled={!deliverTo}>
                  Entregar
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <PrescriptionPaper view={prescription} />

      {active && (
        <form onSubmit={annul} aria-labelledby="rx-anular" className="card space-y-3 border-red-100 p-5">
          <h2 id="rx-anular" className="text-lg font-semibold text-ink-900">
            Anular
          </h2>
          <p className="text-sm text-ink-600">
            Si tiene un error, anúlalo y emite otro. La verificación lo mostrará como anulado y, si está en la cuenta de un
            paciente, le avisamos.
          </p>
          <Textarea label="Motivo" rows={2} maxLength={300} value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} />
          <Button type="submit" variant="danger" loading={annulling} disabled={annulReason.trim().length < 5}>
            Anular récipe
          </Button>
        </form>
      )}
    </div>
  );
}
