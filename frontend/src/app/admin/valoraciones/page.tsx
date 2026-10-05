'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { capitalizeFirst, formatDate, formatMonthKey } from '@/lib/dates';
import {
  REPORT_REASON_LABEL,
  REPORT_STATUS_LABEL,
  REVIEW_BASIS_LABEL,
  REVIEW_FLAG_LABELS,
  REVIEW_STATUS,
  SANCTION_PRESET_DAYS,
  type ReviewBasis,
  type ReviewReportReason,
  type ReviewStatus,
  type Sanction,
  type SanctionType,
} from '@/lib/reviews';
import { useAuth } from '@/lib/auth-context';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';
import { Stars } from '@/components/reviews/Stars';
import { cn } from '@/lib/cn';

type Tab = 'PENDING' | 'REPLIES' | 'REPORTED' | 'PUBLISHED' | 'WITHDRAWN' | 'REJECTED';

interface Reply {
  id: string;
  content: string;
  status: ReviewStatus;
  flags: string[];
  moderationNote: string | null;
  updatedAt: string;
}

interface QueueItem {
  id: string;
  rating: number;
  comment: string | null;
  flags: string[];
  status: ReviewStatus;
  basis: ReviewBasis;
  consultationMonth: string;
  authorDisplay: 'ANONYMOUS' | 'INITIAL';
  publishedAt: string | null;
  moderatedAt: string | null;
  moderationNote: string | null;
  createdAt: string;
  updatedAt: string;
  professional: { id: string; slug: string; name: string };
  reply: Reply | null;
  openReports: number;
}

interface Queue {
  items: QueueItem[];
  total: number;
  page: number;
  totalPages: number;
  counts: { PENDING: number; REPLIES: number; REPORTED: number };
}

interface ReviewCase extends QueueItem {
  reports: {
    id: string;
    reason: ReviewReportReason;
    details: string | null;
    status: 'OPEN' | 'UPHELD' | 'DISMISSED';
    createdAt: string;
    resolutionNote: string | null;
    reporter: string;
  }[];
  author: {
    userId: string | null;
    patientId: string;
    account: { isActive: boolean; deletedAt: string | null; suspendedUntil: string | null } | null;
    reviews: Partial<Record<ReviewStatus, number>>;
    sanctions: Sanction[];
  };
  doctor: { userId: string; name: string; sanctions: Sanction[] };
}

interface AuthorIdentityData {
  patientCode: string;
  name: string;
  identityStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  otherReviews: { id: string; rating: number; status: ReviewStatus; createdAt: string; professional: string }[];
}

const TABS: { tab: Tab; label: string; count?: keyof Queue['counts'] }[] = [
  { tab: 'PENDING', label: 'Pendientes', count: 'PENDING' },
  { tab: 'REPLIES', label: 'Respuestas', count: 'REPLIES' },
  { tab: 'REPORTED', label: 'Denunciadas', count: 'REPORTED' },
  { tab: 'PUBLISHED', label: 'Publicadas' },
  { tab: 'WITHDRAWN', label: 'Retiradas' },
  { tab: 'REJECTED', label: 'Rechazadas' },
];

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function FlagList({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-amber-800">
      <span className="font-semibold">Revisar:</span>
      {flags.map((flag) => (
        <Badge key={flag} tone="amber">
          {REVIEW_FLAG_LABELS[flag] ?? flag}
        </Badge>
      ))}
    </p>
  );
}

export default function AdminReviewsPage() {
  const [tab, setTab] = useState<Tab>('PENDING');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ tab, page: String(page) });
    if (query) params.set('search', query);
    if (rating) params.set('rating', rating);
    api
      .get<Queue>(`/reviews/admin?${params.toString()}`)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((e) => setError(errorText(e, 'No se pudo cargar la cola')));
  }, [tab, page, query, rating]);

  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Valoraciones</h1>
        <p className="mt-1 text-sm text-ink-600">
          Comentarios y respuestas por revisar, denuncias de los médicos y lo ya publicado o retirado. La cola no muestra quién
          escribió cada opinión: se ve al abrir el caso, con el código de los registros de pacientes, y queda en la auditoría.
        </p>
      </div>

      <div role="tablist" aria-label="Estado" className="flex gap-1 overflow-x-auto border-b border-ink-100">
        {TABS.map((item) => {
          const count = item.count && data ? data.counts[item.count] : 0;
          return (
            <button
              key={item.tab}
              type="button"
              role="tab"
              aria-selected={tab === item.tab}
              onClick={() => {
                setTab(item.tab);
                setPage(1);
              }}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                tab === item.tab ? 'border-pine-700 text-pine-800' : 'border-transparent text-ink-600 hover:text-ink-900',
              )}
            >
              {item.label}
              {count > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{count}</span>}
            </button>
          );
        })}
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <Input label="Médico" placeholder="Nombre o apellido" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-44">
          <Select
            label="Estrellas"
            value={rating}
            onChange={(value) => {
              setRating(value);
              setPage(1);
            }}
            options={[{ value: '', label: 'Todas' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? 'estrella' : 'estrellas'}` }))]}
          />
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        !error && <PageSpinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="No hay valoraciones aquí" />
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <article key={item.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={item.rating} />
                  <Badge tone={REVIEW_STATUS[item.status].tone}>{REVIEW_STATUS[item.status].label}</Badge>
                  {item.openReports > 0 && <Badge tone="red">{item.openReports === 1 ? '1 denuncia' : `${item.openReports} denuncias`}</Badge>}
                </div>
                <span className="text-xs text-ink-500">Actualizada el {formatDate(item.updatedAt, { dateStyle: 'medium' })}</span>
              </div>
              <p className="text-sm text-ink-700">
                Sobre <span className="font-medium">Dr(a). {item.professional.name}</span> ·{' '}
                {REVIEW_BASIS_LABEL[item.basis]} · {capitalizeFirst(formatMonthKey(item.consultationMonth))}
              </p>
              {item.comment ? (
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-ink-800">{item.comment}</p>
              ) : (
                <p className="text-sm italic text-ink-500">Sin comentario</p>
              )}
              <FlagList flags={item.flags} />
              {item.reply && (
                <p className="text-xs text-ink-600">
                  Respuesta del médico: <Badge tone={REVIEW_STATUS[item.reply.status].tone}>{REVIEW_STATUS[item.reply.status].label}</Badge>
                </p>
              )}
              <Button size="sm" variant="outline" onClick={() => setOpenId(item.id)}>
                Revisar
              </Button>
            </article>
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Páginas">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anteriores
          </Button>
          <span className="text-sm text-ink-600">
            Página {data.page} de {data.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            Siguientes
          </Button>
        </nav>
      )}

      {openId && (
        <CaseDialog
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={(closeDialog) => {
            if (closeDialog) setOpenId(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CaseDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (closeDialog: boolean) => void }) {
  const { user } = useAuth();
  const canSuspendAccounts = !!user?.permissions?.includes('MANAGE_ACCOUNTS');
  const [data, setData] = useState<ReviewCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [sanctioning, setSanctioning] = useState<{ userId: string; who: string } | null>(null);

  const reload = useCallback(() => {
    api
      .get<ReviewCase>(`/reviews/admin/${id}`)
      .then(setData)
      .catch((e) => setError(errorText(e, 'No se pudo abrir el caso')));
  }, [id]);

  useEffect(reload, [reload]);

  /** Ejecuta una decisión; `keepOpen` deja el caso abierto para seguir (p. ej. sancionar). */
  const run = async (label: string, action: () => Promise<unknown>, keepOpen = true) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(label);
      setReason('');
      onChanged(!keepOpen);
      if (keepOpen) reload();
    } catch (e) {
      setError(errorText(e, 'No se pudo guardar la decisión'));
    } finally {
      setBusy(false);
    }
  };

  const needReason = (fn: () => void) => () => {
    if (reason.trim().length < 8) {
      setError('Escribe el motivo (al menos 8 caracteres): lo recibe el afectado');
      return;
    }
    fn();
  };

  return (
    <Modal open onClose={onClose} title="Revisar la valoración" widthClassName="max-w-3xl">
      {!data ? (
        error ? <Alert tone="error">{error}</Alert> : <PageSpinner />
      ) : (
        <div className="space-y-6">
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}

          <section aria-label="La valoración" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Stars value={data.rating} />
              <Badge tone={REVIEW_STATUS[data.status].tone}>{REVIEW_STATUS[data.status].label}</Badge>
            </div>
            <p className="text-sm text-ink-700">
              Sobre{' '}
              <Link href={`/medicos/${data.professional.slug}`} className="font-medium underline" target="_blank">
                Dr(a). {data.professional.name}
              </Link>{' '}
              · {REVIEW_BASIS_LABEL[data.basis]} · {capitalizeFirst(formatMonthKey(data.consultationMonth))} · se publica como{' '}
              {data.authorDisplay === 'INITIAL' ? 'nombre e inicial' : '«Paciente verificado»'}
            </p>
            {data.comment ? (
              <p className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm text-ink-800">{data.comment}</p>
            ) : (
              <p className="text-sm italic text-ink-500">Sin comentario</p>
            )}
            <FlagList flags={data.flags} />
            {data.moderationNote && <p className="text-sm text-ink-600">Motivo registrado: {data.moderationNote}</p>}
          </section>

          <section aria-label="Decisión" className="space-y-3 rounded-lg border border-ink-100 p-4">
            <Textarea
              label="Motivo (lo recibe el autor o el médico; obligatorio para rechazar, retirar, eliminar o sancionar)"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {data.status === 'PENDING' && (
                <>
                  <Button size="sm" loading={busy} onClick={() => void run('Valoración publicada.', () => api.patch(`/reviews/admin/${id}/approve`), false)}>
                    Aprobar y publicar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={needReason(() => void run('Valoración rechazada; avisamos al autor.', () => api.patch(`/reviews/admin/${id}/reject`, { reason: reason.trim() }), false))}
                  >
                    Rechazar
                  </Button>
                </>
              )}
              {data.status === 'PUBLISHED' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={needReason(() => void run('Valoración retirada del sitio y guardada como evidencia.', () => api.patch(`/reviews/admin/${id}/withdraw`, { reason: reason.trim() })))}
                >
                  Retirar del sitio
                </Button>
              )}
              {(data.status === 'WITHDRAWN' || data.status === 'REJECTED') && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('Valoración publicada otra vez.', () => api.patch(`/reviews/admin/${id}/restore`))}>
                  Restaurar y publicar
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setShowDelete((v) => !v)}>
                Eliminar para siempre…
              </Button>
            </div>
            {showDelete && (
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800">
                  Borra la valoración y su respuesta sin dejar evidencia (para casos como datos de salud de otra persona). No se
                  puede deshacer. Escribe <strong>ELIMINAR</strong> y el motivo arriba.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-48">
                    <Input label="Confirmación" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy || confirmDelete !== 'ELIMINAR'}
                    onClick={needReason(() =>
                      void run('Valoración eliminada.', () => api.post(`/reviews/admin/${id}/delete`, { reason: reason.trim(), confirm: confirmDelete }), false),
                    )}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            )}
          </section>

          {data.reply && (
            <section aria-label="Respuesta del médico" className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-ink-900">Respuesta del médico</h3>
                <Badge tone={REVIEW_STATUS[data.reply.status].tone}>{REVIEW_STATUS[data.reply.status].label}</Badge>
              </div>
              <p className="whitespace-pre-wrap rounded-lg bg-pine-50/70 p-3 text-sm text-ink-800">{data.reply.content}</p>
              <FlagList flags={data.reply.flags} />
              {data.reply.moderationNote && <p className="text-sm text-ink-600">Motivo registrado: {data.reply.moderationNote}</p>}
              <div className="flex flex-wrap gap-2">
                {data.reply.status === 'PENDING' && (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => void run('Respuesta publicada.', () => api.patch(`/reviews/admin/${id}/reply`, { action: 'APPROVE' }))}>
                      Aprobar respuesta
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={needReason(() => void run('Respuesta rechazada; avisamos al médico.', () => api.patch(`/reviews/admin/${id}/reply`, { action: 'REJECT', reason: reason.trim() })))}
                    >
                      Rechazar respuesta
                    </Button>
                  </>
                )}
                {data.reply.status === 'PUBLISHED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={needReason(() => void run('Respuesta retirada; avisamos al médico.', () => api.patch(`/reviews/admin/${id}/reply`, { action: 'WITHDRAW', reason: reason.trim() })))}
                  >
                    Retirar respuesta
                  </Button>
                )}
                {(data.reply.status === 'REJECTED' || data.reply.status === 'WITHDRAWN') && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('Respuesta publicada.', () => api.patch(`/reviews/admin/${id}/reply`, { action: 'RESTORE' }))}>
                    Restaurar respuesta
                  </Button>
                )}
              </div>
            </section>
          )}

          {data.reports.length > 0 && (
            <section aria-label="Denuncias" className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-900">Denuncias</h3>
              {data.reports.map((report) => (
                <div key={report.id} className="rounded-lg border border-ink-100 p-3 text-sm">
                  <p className="text-ink-800">
                    <span className="font-medium">{report.reporter}</span>: {REPORT_REASON_LABEL[report.reason]} ·{' '}
                    {formatDate(report.createdAt, { dateStyle: 'medium' })} ·{' '}
                    <Badge tone={report.status === 'OPEN' ? 'amber' : 'neutral'}>{REPORT_STATUS_LABEL[report.status]}</Badge>
                  </p>
                  {report.details && <p className="mt-1 whitespace-pre-wrap text-ink-700">{report.details}</p>}
                  {report.resolutionNote && <p className="mt-1 text-ink-600">Respuesta: {report.resolutionNote}</p>}
                  {report.status === 'OPEN' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={needReason(() =>
                          void run('Denuncia resuelta: procedente.', () => api.patch(`/reviews/admin/reports/${report.id}`, { status: 'UPHELD', note: reason.trim() })),
                        )}
                      >
                        Dar la razón
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={needReason(() =>
                          void run('Denuncia desestimada.', () => api.patch(`/reviews/admin/reports/${report.id}`, { status: 'DISMISSED', note: reason.trim() })),
                        )}
                      >
                        Desestimar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-ink-500">El texto del motivo de arriba es la respuesta que recibe el médico.</p>
            </section>
          )}

          <section aria-label="Autor" className="space-y-3 rounded-lg border border-ink-100 p-4">
            <h3 className="text-sm font-semibold text-ink-900">Autor</h3>
            <p className="text-sm text-ink-700">
              Cuenta:{' '}
              {!data.author.account
                ? 'eliminada'
                : data.author.account.suspendedUntil && new Date(data.author.account.suspendedUntil) > new Date()
                  ? `suspendida hasta el ${formatDate(data.author.account.suspendedUntil, { dateStyle: 'long' })}`
                  : data.author.account.isActive
                    ? 'activa'
                    : 'suspendida o dada de baja'}{' '}
              · Valoraciones:{' '}
              {Object.entries(data.author.reviews)
                .map(([status, count]) => `${count} ${REVIEW_STATUS[status as ReviewStatus].label.toLocaleLowerCase('es-VE')}`)
                .join(', ') || 'ninguna'}
            </p>
            <AuthorIdentity reviewId={id} />
            <SanctionList sanctions={data.author.sanctions} canSuspendAccounts={canSuspendAccounts} reason={reason} onChanged={reload} />
            <div className="flex flex-wrap gap-2">
              {data.author.userId && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setSanctioning({ userId: data.author.userId!, who: 'al autor' })}>
                  Sancionar al autor
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={needReason(() =>
                  void run('Retiramos todas sus valoraciones publicadas y rechazamos las pendientes.', () =>
                    api.post(`/reviews/admin/authors/${data.author.patientId}/withdraw-all`, { reason: reason.trim() }),
                  ),
                )}
              >
                Retirar todas sus valoraciones
              </Button>
            </div>
          </section>

          <section aria-label="Médico" className="space-y-3 rounded-lg border border-ink-100 p-4">
            <h3 className="text-sm font-semibold text-ink-900">Médico: Dr(a). {data.doctor.name}</h3>
            <SanctionList sanctions={data.doctor.sanctions} canSuspendAccounts={canSuspendAccounts} reason={reason} onChanged={reload} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setSanctioning({ userId: data.doctor.userId, who: 'al médico' })}>
              Sancionar al médico (respuestas)
            </Button>
          </section>

          {sanctioning && (
            <SanctionForm
              userId={sanctioning.userId}
              who={sanctioning.who}
              reviewId={id}
              canSuspendAccounts={canSuspendAccounts}
              onCancel={() => setSanctioning(null)}
              onDone={(message) => {
                setSanctioning(null);
                setNotice(message);
                reload();
              }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/** Quién es el autor: exige la bóveda de pacientes (código de seguridad) y queda en la auditoría. */
function AuthorIdentity({ reviewId }: { reviewId: string }) {
  const [identity, setIdentity] = useState<AuthorIdentityData | null>(null);
  const [locked, setLocked] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const show = async () => {
    setLoading(true);
    setError(null);
    try {
      setIdentity(await api.get<AuthorIdentityData>(`/patients/admin/reviews/${reviewId}/author`));
      setLocked(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && (e.data as { code?: string } | null)?.code === 'PATIENT_VAULT_LOCKED') {
        setLocked(true);
      } else {
        setError(errorText(e, 'No se pudo ver al autor'));
      }
    } finally {
      setLoading(false);
    }
  };

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/patients/admin/vault/unlock', { code });
      setCode('');
      await show();
    } catch (e) {
      setCode('');
      setError(errorText(e, 'No se pudo abrir el acceso'));
      setLoading(false);
    }
  };

  if (identity) {
    return (
      <div className="rounded-lg bg-gold-50 p-3 text-sm text-ink-800">
        <p>
          <span className="font-semibold">{identity.name}</span> · {identity.patientCode} · cédula{' '}
          {identity.identityStatus === 'VERIFIED' ? 'aprobada' : identity.identityStatus === 'PENDING' ? 'en revisión' : 'rechazada'}
        </p>
        {identity.otherReviews.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-ink-700">
            {identity.otherReviews.map((other) => (
              <li key={other.id}>
                {other.rating}★ a Dr(a). {other.professional} · {REVIEW_STATUS[other.status].label} ·{' '}
                {formatDate(other.createdAt, { dateStyle: 'medium' })}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-500">Esta consulta quedó en la auditoría.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      {locked ? (
        <form onSubmit={unlock} className="flex flex-wrap items-end gap-2 rounded-lg border border-gold-200 bg-gold-50 p-3">
          <p className="w-full text-sm text-gold-900">
            La identidad del autor es un registro de paciente: ingresa el código de seguridad (abre los registros por 15 minutos y
            queda en la auditoría).
          </p>
          <div className="w-56">
            <Input
              id="codigo-boveda-valoraciones"
              label="Código de seguridad"
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" loading={loading} disabled={!code}>
            Abrir y ver
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="outline" loading={loading} onClick={() => void show()}>
          Ver quién es (con el código de seguridad)
        </Button>
      )}
    </div>
  );
}

/** Sanciones de una cuenta; levantar usa el motivo escrito arriba y cambiar la duración se hace aquí mismo. */
function SanctionList({
  sanctions,
  canSuspendAccounts,
  reason,
  onChanged,
}: {
  sanctions: Sanction[];
  canSuspendAccounts: boolean;
  reason: string;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [days, setDays] = useState('7');
  const [indefinite, setIndefinite] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!sanctions.length) return <p className="text-xs text-ink-500">Sin sanciones.</p>;

  const lift = async (sanction: Sanction) => {
    if (reason.trim().length < 8) {
      setError('Escribe arriba el motivo para levantarla (al menos 8 caracteres): lo recibe el titular');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/reviews/admin/sanctions/${sanction.id}/lift`, { reason: reason.trim() });
      onChanged();
    } catch (e) {
      setError(errorText(e, 'No se pudo levantar la sanción'));
    } finally {
      setSaving(false);
    }
  };

  const change = async (event: React.FormEvent, sanction: Sanction) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/reviews/admin/sanctions/${sanction.id}`, indefinite ? { indefinite: true } : { days: Number(days) });
      setChanging(null);
      onChanged();
    } catch (e) {
      setError(errorText(e, 'No se pudo cambiar la sanción'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="space-y-1.5 text-sm">
        {sanctions.map((sanction) => {
          const manageable = sanction.active && (sanction.type === 'REVIEWS' || canSuspendAccounts);
          return (
            <li key={sanction.id} className="rounded-md bg-ink-50 px-3 py-2">
              <span className="font-medium">{sanction.typeLabel}</span> ·{' '}
              {sanction.endsAt ? `hasta el ${formatDate(sanction.endsAt, { dateStyle: 'long' })}` : 'indefinida'} ·{' '}
              {sanction.liftedAt ? 'levantada' : sanction.active ? 'vigente' : 'terminada'}
              <span className="block text-xs text-ink-600">Motivo: {sanction.reason}</span>
              {manageable && changing !== sanction.id && (
                <span className="mt-1 flex gap-2">
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => setChanging(sanction.id)}>
                    Cambiar duración
                  </Button>
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => void lift(sanction)}>
                    Levantar
                  </Button>
                </span>
              )}
              {changing === sanction.id && (
                <form onSubmit={(event) => void change(event, sanction)} className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="w-36">
                    <Input
                      label="Días desde hoy"
                      type="number"
                      min={1}
                      max={365}
                      value={days}
                      disabled={indefinite}
                      onChange={(e) => setDays(e.target.value)}
                    />
                  </div>
                  {sanction.type === 'REVIEWS' && (
                    <label className="flex items-center gap-2 pb-3 text-sm text-ink-700">
                      <input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} />
                      Indefinida
                    </label>
                  )}
                  <Button type="submit" size="sm" loading={saving}>
                    Guardar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setChanging(null)}>
                    Cancelar
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SanctionForm({
  userId,
  who,
  reviewId,
  canSuspendAccounts,
  onCancel,
  onDone,
}: {
  userId: string;
  who: string;
  reviewId: string;
  canSuspendAccounts: boolean;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const [type, setType] = useState<SanctionType>('REVIEWS');
  const [days, setDays] = useState('7');
  const [indefinite, setIndefinite] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/reviews/admin/sanctions', {
        userId,
        type,
        reason: reason.trim(),
        reviewId,
        ...(indefinite && type === 'REVIEWS' ? { indefinite: true } : { days: Number(days) }),
      });
      onDone(type === 'ACCOUNT' ? 'Cuenta suspendida; avisamos al titular.' : 'Sanción aplicada; avisamos al titular.');
    } catch (e) {
      setError(errorText(e, 'No se pudo aplicar la sanción'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4" aria-label={`Sancionar ${who}`}>
      <h3 className="text-sm font-semibold text-ink-900">Sancionar {who}</h3>
      {error && <Alert tone="error">{error}</Alert>}
      <Select
        label="Tipo"
        value={type}
        onChange={(value) => {
          setType(value as SanctionType);
          if (value === 'ACCOUNT') setIndefinite(false);
        }}
        options={[
          { value: 'REVIEWS', label: 'Sin opiniones ni respuestas' },
          ...(canSuspendAccounts ? [{ value: 'ACCOUNT', label: 'Cuenta suspendida' }] : []),
        ]}
        hint={
          type === 'ACCOUNT'
            ? 'No puede iniciar sesión hasta la fecha; conserva sus citas y las autorizaciones a sus médicos.'
            : 'No puede escribir ni editar opiniones ni respuestas; el resto de la cuenta sigue igual.'
        }
      />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-800">Duración</legend>
        <div className="flex flex-wrap items-center gap-2">
          {SANCTION_PRESET_DAYS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={!indefinite && days === String(preset) ? 'primary' : 'outline'}
              aria-pressed={!indefinite && days === String(preset)}
              onClick={() => {
                setDays(String(preset));
                setIndefinite(false);
              }}
            >
              {preset === 1 ? '1 día' : `${preset} días`}
            </Button>
          ))}
          <div className="w-28">
            <Input
              aria-label="Días (1 a 365)"
              type="number"
              min={1}
              max={365}
              value={days}
              disabled={indefinite}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          {type === 'REVIEWS' && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} />
              Indefinida
            </label>
          )}
        </div>
      </fieldset>
      <Textarea
        label="Motivo (lo recibe el titular con la fecha de fin y cómo reclamar)"
        rows={2}
        maxLength={500}
        required
        minLength={8}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" loading={saving} disabled={reason.trim().length < 8}>
          Aplicar la sanción
        </Button>
      </div>
    </form>
  );
}
