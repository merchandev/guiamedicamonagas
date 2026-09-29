'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { isVaultLocked, usePatientVault } from '@/components/PatientVaultGate';
import { VERIFICATION_LABELS } from '@/lib/labels';
import { YouTubePresentation } from '@/components/YouTubePresentation';
import { parseYouTubeVideoId, youTubeShortUrl } from '@/lib/youtube';

interface Account {
  id: string; email: string; isActive: boolean; deletedAt: string | null; moderationReason: string | null;
  professionalProfile: { id: string; firstName: string; lastName: string; slug: string; planTier: string;
    isPublished: boolean; verificationStatus: string; presentationVideoId: string | null;
    subscriptions: { currentPeriodEnd: string | null; plan: { id: string; name: string } }[] } | null;
  patientProfile: { patientCode: string; firstName: string | null; lastName: string | null } | null;
}
interface Results { items: Account[]; total: number; page: number; totalPages: number }
interface Plan { id: string; name: string; tier: string; priceUsd: string; billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' }
interface Bank { code: string; name: string; supportsPagoMovil: boolean }
type Action = 'SUSPEND' | 'DELETE' | 'RESTORE';
const actionLabel: Record<Action, string> = { SUSPEND: 'Suspender cuenta', DELETE: 'Dar de baja', RESTORE: 'Reactivar cuenta' };
const CYCLE_LABEL: Record<Plan['billingCycle'], string> = { MONTHLY: 'mensual', QUARTERLY: 'trimestral', YEARLY: 'anual' };
const CYCLE_UNIT: Record<Plan['billingCycle'], [string, string]> = { MONTHLY: ['mes', 'meses'], QUARTERLY: ['trimestre', 'trimestres'], YEARLY: ['año', 'años'] };
const PURGE_CONFIRMATION = 'ELIMINAR';
const nameOf = (a: Account) => {
  const p = a.professionalProfile ?? a.patientProfile;
  return p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || a.email : a.email;
};
const formatDate = (date: Date) => date.toLocaleDateString('es-VE', { dateStyle: 'long' });

/** Misma regla que el servidor (SubscriptionsService.nextPeriodEnd), repetida `periods` veces. */
function periodEnd(from: Date, cycle: Plan['billingCycle'], periods: number) {
  const end = new Date(from);
  for (let i = 0; i < periods; i += 1) {
    if (cycle === 'MONTHLY') end.setMonth(end.getMonth() + 1);
    if (cycle === 'QUARTERLY') end.setMonth(end.getMonth() + 3);
    if (cycle === 'YEARLY') end.setFullYear(end.getFullYear() + 1);
  }
  return end;
}

export function AdminAccountManager({ kind }: { kind: 'professionals' | 'patients' }) {
  const { user } = useAuth();
  const { relock } = usePatientVault();
  const canManage = user?.permissions.includes('MANAGE_ACCOUNTS');
  const canPurge = user?.permissions.includes('PURGE_ACCOUNTS');
  const canAssign = user?.permissions.includes('ASSIGN_PAID_PLANS') && user?.permissions.includes('REVIEW_PAYMENTS');
  const endpoint = kind === 'patients' ? '/patients/admin/accounts' : '/admin/accounts/professionals';
  const [results, setResults] = useState<Results | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ account: Account; action: Action } | null>(null);
  const [purging, setPurging] = useState<Account | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [assignment, setAssignment] = useState<Account | null>(null);
  const [planId, setPlanId] = useState('');
  const [periods, setPeriods] = useState('1');
  const [amountBs, setAmountBs] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState('PAGO_MOVIL');
  const [paidAt, setPaidAt] = useState('');
  const [videoFor, setVideoFor] = useState<Account | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const requestId = useRef(0);

  const handleError = useCallback((e: unknown) => {
    if (isVaultLocked(e)) { setResults(null); relock(); return; }
    setError(e instanceof ApiError ? e.message : 'No se pudo completar la operación. Intenta de nuevo.');
  }, [relock]);
  const load = useCallback(async () => {
    if (!canManage) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await api.get<Results>(`${endpoint}?${new URLSearchParams({ page: String(page), ...(status ? { status } : {}), ...(query ? { search: query } : {}) })}`);
      if (id === requestId.current) setResults(data);
    } catch (e) { if (id === requestId.current) { setResults(null); handleError(e); } }
    finally { if (id === requestId.current) setLoading(false); }
  }, [canManage, endpoint, page, status, query, handleError]);
  useEffect(() => { void load(); return () => { requestId.current++; }; }, [load]);

  const openModeration = (account: Account, action: Action) => {
    setSelected({ account, action }); setReason(''); setConfirmed(false); setError(null); setSuccess(null);
  };
  const moderate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !confirmed || busy) return;
    setBusy(true); setError(null);
    try {
      await api.patch(`${endpoint}/${selected.account.id}`, { action: selected.action, reason: reason.trim() });
      setSuccess(`${actionLabel[selected.action]}: cambio guardado para ${nameOf(selected.account)}. Le enviamos un aviso con el motivo.`);
      setSelected(null); await load();
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };
  const openPurge = (account: Account) => {
    setPurging(account); setReason(''); setPurgeConfirm(''); setError(null); setSuccess(null);
  };
  const purge = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!purging || purgeConfirm !== PURGE_CONFIRMATION || busy) return;
    setBusy(true); setError(null);
    try {
      await api.post(`${endpoint}/${purging.id}/purge`, { reason: reason.trim(), confirm: purgeConfirm });
      setSuccess(`Cuenta de ${nameOf(purging)} eliminada definitivamente.`);
      setPurging(null); await load();
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };
  const openAssignment = async (account: Account) => {
    setError(null); setSuccess(null); setBusy(true);
    try {
      const [availablePlans, availableBanks] = await Promise.all([api.get<Plan[]>('/subscriptions/plans'), api.get<Bank[]>('/payments/banks')]);
      setPlans(availablePlans.filter(p => p.tier !== 'FREE' && p.tier !== 'ORGANIZATION'));
      setBanks(availableBanks); setAssignment(account); setPlanId(account.professionalProfile?.subscriptions[0]?.plan.id ?? '');
      setPeriods('1'); setAmountBs(''); setBankCode(''); setReference('');
      setMethod('PAGO_MOVIL'); setPaidAt(''); setReason(''); setConfirmed(false);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };
  const assign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assignment?.professionalProfile || !confirmed || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await api.post<{ currentPeriodEnd: string; renewed: boolean }>(`/subscriptions/admin/professionals/${assignment.professionalProfile.id}/assign-paid-plan`, {
        planId, amountBs: Number(amountBs), senderBankCode: bankCode, referenceNumber: reference,
        method, paidAt: new Date(paidAt).toISOString(), periods: Number(periods), reason: reason.trim(),
      });
      setAssignment(null);
      setSuccess(`Pago registrado: ${result.renewed ? 'plan renovado' : 'plan asignado'} hasta el ${formatDate(new Date(result.currentPeriodEnd))}. Le avisamos al médico; su verificación no cambió.`);
      await load();
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const openVideo = (account: Account) => {
    const current = account.professionalProfile?.presentationVideoId;
    setVideoFor(account); setVideoUrl(current ? youTubeShortUrl(current) : ''); setError(null); setSuccess(null);
  };
  const saveVideo = async (next: string | null) => {
    if (!videoFor || busy) return;
    setBusy(true); setError(null);
    try {
      const saved = await api.put<{ presentationVideoId: string | null }>(`${endpoint}/${videoFor.id}/presentation-video`, { url: next });
      setSuccess(saved.presentationVideoId
        ? `Video guardado para ${nameOf(videoFor)}.${videoFor.professionalProfile?.planTier === 'AGENCY' ? '' : ' Se mostrará en su ficha cuando tenga el plan Agencia.'}`
        : `Video quitado de la ficha de ${nameOf(videoFor)}.`);
      setVideoFor(null); await load();
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };
  const videoDraft = parseYouTubeVideoId(videoUrl);

  // Vista previa de la vigencia con la misma regla del servidor.
  const preview = useMemo(() => {
    const plan = plans.find(p => p.id === planId);
    const current = assignment?.professionalProfile?.subscriptions[0];
    if (!plan || !paidAt) return null;
    const paid = new Date(paidAt);
    if (!Number.isFinite(paid.getTime())) return null;
    const currentEnd = current?.currentPeriodEnd ? new Date(current.currentPeriodEnd) : null;
    const renewing = current?.plan.id === plan.id && !!currentEnd && currentEnd > paid;
    const count = Number(periods);
    return { renewing, end: periodEnd(renewing ? currentEnd! : paid, plan.billingCycle, count),
      unit: CYCLE_UNIT[plan.billingCycle][count === 1 ? 0 : 1] };
  }, [plans, planId, paidAt, periods, assignment]);

  if (!canManage) return <Alert tone="warning">No tienes permiso para gestionar cuentas.</Alert>;
  return <div className="space-y-6">
    <div><h1 className="text-2xl">{kind === 'patients' ? 'Cuentas de pacientes' : 'Médicos: cuentas y planes'}</h1>
      <p className="mt-2 text-sm text-ink-600">Suspende el acceso, da de baja o reactiva una cuenta con un motivo registrado; el titular recibe el aviso por correo. La baja es reversible y conserva el historial.</p>
      {canPurge && <p className="mt-2 text-sm text-ink-600">Una cuenta dada de baja se puede <strong>eliminar definitivamente</strong> (se borran sus datos personales; solo se conservan los pagos y las autorizaciones que exige la ley).</p>}
      {kind === 'patients' && <p className="mt-2 text-sm text-ink-500">Esta sección gestiona pacientes con cuenta. Las fichas sin cuenta creadas por un médico conservan su historial.</p>}
      {kind === 'professionals' && <Link href="/admin/pagos" className="mt-2 inline-block text-pine-700 underline">Revisar pagos reportados por los médicos</Link>}
    </div>
    {error && !selected && !assignment && !purging && !videoFor && <Alert tone="error">{error}</Alert>}
    {success && <div role="status"><Alert tone="success">{success}</Alert></div>}
    <form onSubmit={e => { e.preventDefault(); setPage(1); setQuery(search.trim()); }} className="flex flex-wrap items-end gap-3">
      <Input label={kind === 'patients' ? 'Nombre, correo, código, cédula o teléfono' : 'Nombre o correo'} maxLength={100} value={search} onChange={e => setSearch(e.target.value)} />
      <Button type="submit" disabled={busy}>Buscar</Button>
      <Select label="Estado de la cuenta" value={status} onChange={s => { setStatus(s); setPage(1); }} options={[
        { value: '', label: 'Activas y suspendidas' }, { value: 'ACTIVE', label: 'Activas' },
        { value: 'SUSPENDED', label: 'Suspendidas' }, { value: 'DELETED', label: 'Dadas de baja' },
      ]} />
      <Button type="button" variant="outline" onClick={() => { setError(null); void load(); }} disabled={busy || loading}>Actualizar</Button>
    </form>
    {kind === 'patients' && <p className="-mt-3 text-xs text-ink-500">La cédula y el teléfono solo se encuentran escritos completos (se buscan cifrados).</p>}
    <div aria-busy={loading} className="card divide-y divide-ink-100">
      {loading ? <p role="status" className="p-5">Cargando cuentas…</p> : results?.items.length ? results.items.map(account => {
        const profile = account.professionalProfile;
        const verification = profile ? VERIFICATION_LABELS[profile.verificationStatus] : null;
        return <div key={account.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0"><h2 className="break-words font-semibold">{nameOf(account)}</h2><p className="break-all text-sm text-ink-500">{account.email}</p>
            {account.patientProfile && <p className="text-sm">{account.patientProfile.patientCode}</p>}
            {account.moderationReason && <p className="mt-1 break-words text-sm text-ink-600">Último motivo: {account.moderationReason}</p>}
            {profile && <p className="mt-1 text-sm">Plan: {profile.subscriptions[0]?.plan.name ?? profile.planTier}
              {profile.subscriptions[0]?.currentPeriodEnd && ` · Hasta ${new Date(profile.subscriptions[0].currentPeriodEnd).toLocaleDateString('es-VE')}`}</p>}
            <div className="mt-2 flex flex-wrap gap-2"><Badge tone={account.isActive ? 'pine' : 'red'}>{account.deletedAt ? 'Baja' : account.isActive ? 'Cuenta activa' : 'Cuenta suspendida'}</Badge>
              {verification && <Badge tone={verification.tone}>{verification.label}</Badge>}
              {profile?.presentationVideoId && <Badge tone={profile.planTier === 'AGENCY' ? 'gold' : 'neutral'}>{profile.planTier === 'AGENCY' ? 'Con video' : 'Video oculto (sin plan Agencia)'}</Badge>}
              {profile?.isPublished && <Link href={`/medicos/${profile.slug}`} className="text-sm text-pine-700 underline">Ver perfil</Link>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {account.isActive ? <Button size="sm" variant="outline" disabled={busy} onClick={() => openModeration(account, 'SUSPEND')}>Suspender</Button>
              : <Button size="sm" variant="outline" disabled={busy} onClick={() => openModeration(account, 'RESTORE')}>Reactivar</Button>}
            {!account.deletedAt && <Button size="sm" variant="danger" disabled={busy} onClick={() => openModeration(account, 'DELETE')}>Dar de baja</Button>}
            {account.deletedAt && canPurge && <Button size="sm" variant="danger" disabled={busy} onClick={() => openPurge(account)}>Eliminar definitivamente</Button>}
            {kind === 'professionals' && profile && !account.deletedAt && <Button size="sm" variant="outline" disabled={busy} onClick={() => openVideo(account)}>{profile.presentationVideoId ? 'Cambiar video' : 'Video de presentación'}</Button>}
            {kind === 'professionals' && profile && account.isActive && canAssign && <Button size="sm" disabled={busy || profile.verificationStatus === 'SUSPENDED'} onClick={() => void openAssignment(account)}>Registrar pago y asignar plan</Button>}
          </div>
        </div>;
      }) : <p className="p-5">No hay cuentas que coincidan con la búsqueda.</p>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{results?.total ?? 0} cuentas · Página {page} de {Math.max(1, results?.totalPages ?? 1)}</p>
      <div className="flex gap-2"><Button variant="outline" disabled={loading || busy || page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
        <Button variant="outline" disabled={loading || busy || page >= (results?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div>
    </div>
    <Modal open={!!selected} onClose={() => { if (!busy) setSelected(null); }} title={selected ? actionLabel[selected.action] : ''}>
      {selected && <form className="space-y-4" onSubmit={moderate}>
        <p className="font-semibold">{nameOf(selected.account)}</p><p className="break-all text-sm">{selected.account.email}</p>
        <p className="text-sm text-ink-600">{selected.action === 'RESTORE'
          ? 'Permite volver a iniciar sesión. No restaura los permisos de datos revocados. Un médico vuelve al directorio solo si sus documentos, su foto y su biografía cumplen los requisitos de publicación.'
          : 'Cierra las sesiones e impide iniciar sesión. Retira el perfil médico público o revoca los permisos y el código compartido del paciente. Conserva pagos, citas e historial.'}</p>
        <Textarea label="Motivo (el titular lo recibirá por correo; sin datos clínicos)" required minLength={8} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        <label className="flex gap-2 text-sm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo la acción sobre esta cuenta.</label>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancelar</Button>
          <Button type="submit" loading={busy} disabled={!confirmed || reason.trim().length < 8} variant={selected.action === 'RESTORE' ? 'primary' : 'danger'}>Confirmar</Button></div>
      </form>}
    </Modal>
    <Modal open={!!purging} onClose={() => { if (!busy) setPurging(null); }} title="Eliminar definitivamente">
      {purging && <form className="space-y-4" onSubmit={purge}>
        <p className="font-semibold">{nameOf(purging)}</p><p className="break-all text-sm">{purging.email}</p>
        <Alert tone="warning">No se puede deshacer.</Alert>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-600">
          {kind === 'professionals' ? <>
            <li>Se borran su perfil, documentos, foto, sedes, horario, publicaciones, mensajes, agenda, notas clínicas y finanzas.</li>
            <li>Sus citas futuras se cancelan y se avisa a los pacientes.</li>
            <li>Se conservan, sin datos personales, sus pagos y suscripciones (normativa tributaria) y las autorizaciones que recibió (revocadas).</li>
          </> : <>
            <li>Se borran la cuenta, su identidad, contacto, datos de salud, fotos y código para compartir.</li>
            <li>Si un médico lo atendió, su ficha queda solo con el código de paciente para que la agenda y las autorizaciones (evidencia) sigan en pie. Sus citas futuras se cancelan.</li>
          </>}
          <li>El titular recibe un último correo; su correo queda libre para registrarse de nuevo.</li>
        </ul>
        <Textarea label="Motivo (queda en la auditoría)" required minLength={8} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        <Input label={`Escribe ${PURGE_CONFIRMATION} para confirmar`} autoComplete="off" value={purgeConfirm} onChange={e => setPurgeConfirm(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setPurging(null)}>Cancelar</Button>
          <Button type="submit" variant="danger" loading={busy} disabled={purgeConfirm !== PURGE_CONFIRMATION || reason.trim().length < 8}>Eliminar definitivamente</Button></div>
      </form>}
    </Modal>
    <Modal open={!!videoFor} onClose={() => { if (!busy) setVideoFor(null); }} title="Video de presentación">
      {videoFor && <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (videoDraft) void saveVideo(videoUrl.trim()); }}>
        <p className="font-semibold">{nameOf(videoFor)}</p>
        <p className="text-sm text-ink-600">El plan Agencia incluye 2 videos en colaboración con la Guía. Pega el enlace de YouTube del que se mostrará en su ficha. Puedes cargarlo antes de asignar el plan: la ficha solo lo muestra mientras el plan sea Agencia. El médico también puede cambiarlo desde su perfil.</p>
        <Input label="Enlace del video en YouTube" placeholder="https://youtu.be/…" maxLength={300} value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
          error={videoUrl.trim() && !videoDraft ? 'Pega un enlace de YouTube (youtu.be/… o youtube.com/watch?v=…).' : undefined} />
        {videoDraft && <YouTubePresentation key={videoDraft} videoId={videoDraft} title={`Video de ${nameOf(videoFor)}`} />}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setVideoFor(null)}>Cancelar</Button>
          {videoFor.professionalProfile?.presentationVideoId && <Button type="button" variant="danger" loading={busy} onClick={() => void saveVideo(null)}>Quitar video</Button>}
          <Button type="submit" loading={busy} disabled={!videoDraft || videoDraft === videoFor.professionalProfile?.presentationVideoId}>Guardar video</Button></div>
      </form>}
    </Modal>
    <Modal open={!!assignment} onClose={() => { if (!busy) setAssignment(null); }} title="Registrar pago y asignar plan">
      {assignment && <form className="space-y-4" onSubmit={assign}>
        <p className="font-semibold">{nameOf(assignment)}</p>
        {assignment.professionalProfile?.subscriptions[0] && <p className="text-sm">Plan vigente: {assignment.professionalProfile.subscriptions[0].plan.name}
          {assignment.professionalProfile.subscriptions[0].currentPeriodEnd && ` hasta el ${formatDate(new Date(assignment.professionalProfile.subscriptions[0].currentPeriodEnd))}`}</p>}
        <p className="text-sm text-ink-600">Para un pago recibido fuera del reporte de la plataforma. Si ya existe un pago reportado, revísalo en Pagos. Renovar el mismo plan suma el tiempo al final del período vigente; cambiar de plan lo reemplaza desde la fecha del pago, sin prorrateo.</p>
        <Select label="Plan pagado" required value={planId} onChange={setPlanId} options={plans.map(p => ({ value: p.id, label: `${p.name} · USD ${p.priceUsd} · ${CYCLE_LABEL[p.billingCycle] ?? p.billingCycle}` }))} />
        <Select label="Períodos pagados" value={periods} onChange={setPeriods} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
        <Select label="Método" value={method} onChange={m => { setMethod(m); setBankCode(''); }} options={[{ value: 'PAGO_MOVIL', label: 'Pago Móvil' }, { value: 'BANK_TRANSFER', label: 'Transferencia bancaria' }]} />
        <Select label="Banco emisor" required value={bankCode} onChange={setBankCode} options={banks.filter(b => method !== 'PAGO_MOVIL' || b.supportsPagoMovil).map(b => ({ value: b.code, label: `${b.code} · ${b.name}` }))} />
        <Input label="Referencia bancaria" required minLength={4} maxLength={50} pattern="[A-Za-z0-9\-]{4,50}" value={reference} onChange={e => setReference(e.target.value)} />
        <Input label="Importe recibido (Bs)" type="number" min="0.01" step="0.01" max="9999999999.99" required value={amountBs} onChange={e => setAmountBs(e.target.value)} />
        <Input label="Fecha y hora del pago (hora de tu equipo)" type="datetime-local" required value={paidAt} onChange={e => setPaidAt(e.target.value)} />
        {preview && <p role="status" className="rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-800">
          {preview.renewing ? 'Renovación' : 'Nuevo plan'}: {periods} {preview.unit}, vigente hasta el <strong>{formatDate(preview.end)}</strong>.</p>}
        <Textarea label="Motivo y evidencia de la revisión" required minLength={8} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        <label className="flex gap-2 text-sm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo que verifiqué el pago recibido y el plan contratado.</label>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setAssignment(null)}>Cancelar</Button>
          <Button type="submit" loading={busy} disabled={!confirmed || !planId || !bankCode || reason.trim().length < 8}>Asignar plan pagado</Button></div>
      </form>}
    </Modal>
  </div>;
}
