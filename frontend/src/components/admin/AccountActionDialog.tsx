'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { isVaultLocked } from '@/components/PatientVaultGate';

export type AccountKind = 'professionals' | 'patients';
export type AccountAction = 'SUSPEND' | 'DELETE' | 'RESTORE' | 'PURGE';
export interface AccountTarget { id: string; name: string; email: string }
export interface AccountRequest { account: AccountTarget; action: AccountAction }

export const ACCOUNT_ACTION_LABELS: Record<AccountAction, string> = {
  SUSPEND: 'Suspender cuenta',
  DELETE: 'Dar de baja',
  RESTORE: 'Reactivar cuenta',
  PURGE: 'Eliminar definitivamente',
};
export const accountsEndpoint = (kind: AccountKind) =>
  kind === 'patients' ? '/patients/admin/accounts' : '/admin/accounts/professionals';

const PURGE_CONFIRMATION = 'ELIMINAR';

interface Props {
  kind: AccountKind;
  request: AccountRequest | null;
  onClose: () => void;
  /** La acción se guardó: el mensaje ya nombra la cuenta. */
  onDone: (message: string) => void;
  /** Solo pacientes: la bóveda se cerró mientras el diálogo estaba abierto. */
  onVaultLocked?: () => void;
}

/**
 * Suspender, dar de baja, reactivar o eliminar definitivamente una cuenta,
 * siempre con un motivo. Lo usan la gestión de cuentas y la lista de médicos.
 */
export function AccountActionDialog({ kind, request, onClose, onDone, onVaultLocked }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={!!request} onClose={() => { if (!busy) onClose(); }} title={request ? ACCOUNT_ACTION_LABELS[request.action] : ''}>
      {request && (
        <ActionForm kind={kind} request={request} busy={busy} setBusy={setBusy}
          onClose={onClose} onDone={onDone} onVaultLocked={onVaultLocked} />
      )}
    </Modal>
  );
}

function ActionForm({ kind, request, busy, setBusy, onClose, onDone, onVaultLocked }: Omit<Props, 'request'> & {
  request: AccountRequest; busy: boolean; setBusy: (busy: boolean) => void;
}) {
  const { account, action } = request;
  const purge = action === 'PURGE';
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim().length >= 8 && (purge ? typed === PURGE_CONFIRMATION : confirmed);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try {
      const url = `${accountsEndpoint(kind)}/${account.id}`;
      if (purge) {
        await api.post(`${url}/purge`, { reason: reason.trim(), confirm: typed });
        onDone(`Cuenta de ${account.name} eliminada definitivamente. Su correo quedó libre para registrarse de nuevo.`);
      } else {
        await api.patch(url, { action, reason: reason.trim() });
        onDone(`${ACCOUNT_ACTION_LABELS[action]}: cambio guardado para ${account.name}. Le enviamos un aviso con el motivo.`);
      }
    } catch (e) {
      if (isVaultLocked(e)) { onVaultLocked?.(); return; }
      setError(e instanceof ApiError ? e.message : 'No se pudo completar la operación. Intenta de nuevo.');
    } finally { setBusy(false); }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <p className="font-semibold">{account.name}</p>
        <p className="break-all text-sm">{account.email}</p>
      </div>
      {purge ? (
        <>
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
            <li>El titular recibe un último correo. Su correo{kind === 'patients' ? ' y su cédula quedan libres' : ' queda libre'} para registrarse de nuevo como una cuenta nueva.</li>
          </ul>
        </>
      ) : (
        <p className="text-sm text-ink-600">{action === 'RESTORE'
          ? 'Permite volver a iniciar sesión. No restaura los permisos de datos revocados. Un médico vuelve al directorio solo si sus documentos, su foto y su biografía cumplen los requisitos de publicación.'
          : 'Cierra las sesiones e impide iniciar sesión. Retira el perfil médico público o revoca los permisos y el código compartido del paciente. Conserva pagos, citas e historial.'}</p>
      )}
      <Textarea label={purge ? 'Motivo (queda en la auditoría)' : 'Motivo (el titular lo recibirá por correo; sin datos clínicos)'}
        required minLength={8} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
      {purge
        ? <Input label={`Escribe ${PURGE_CONFIRMATION} para confirmar`} autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)} />
        : <label className="flex gap-2 text-sm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo la acción sobre esta cuenta.</label>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button type="submit" loading={busy} disabled={!ready} variant={action === 'RESTORE' ? 'primary' : 'danger'}>
          {purge ? 'Eliminar definitivamente' : 'Confirmar'}
        </Button>
      </div>
    </form>
  );
}
