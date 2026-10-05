/** Tipos y textos de las valoraciones (sirven en el servidor y en el navegador). */

export type ReviewStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'WITHDRAWN';
export type ReviewBasis = 'APPOINTMENT' | 'REGISTERED';
export type ReviewAuthorDisplay = 'ANONYMOUS' | 'INITIAL';
export type ReviewReportReason = 'NOT_MY_PATIENT' | 'HEALTH_DATA' | 'OFFENSIVE' | 'FALSE' | 'OTHER';

export interface ReviewSummaryData {
  /** null hasta 3 valoraciones publicadas. */
  average: number | null;
  count: number;
  distribution: { stars: number; count: number }[] | null;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  author: string;
  basis: ReviewBasis;
  /** «2026-09»: solo el mes y el año de la consulta. */
  consultationMonth: string;
  reply: { content: string } | null;
}

export type PublicReviewPage =
  | { enabled: false }
  | { enabled: true; summary: ReviewSummaryData; items: PublicReview[]; total: number; page: number; totalPages: number };

export const REVIEW_STATUS: Record<ReviewStatus, { label: string; tone: 'amber' | 'pine' | 'red' | 'neutral' }> = {
  PENDING: { label: 'En revisión', tone: 'amber' },
  PUBLISHED: { label: 'Publicada', tone: 'pine' },
  REJECTED: { label: 'No publicada', tone: 'red' },
  WITHDRAWN: { label: 'Retirada', tone: 'neutral' },
};

export const REVIEW_BASIS_LABEL: Record<ReviewBasis, string> = {
  APPOINTMENT: 'Cita realizada en la plataforma',
  REGISTERED: 'Paciente registrado por el médico',
};

export const REPORT_REASONS: { value: ReviewReportReason; label: string }[] = [
  { value: 'NOT_MY_PATIENT', label: 'No fue mi paciente' },
  { value: 'HEALTH_DATA', label: 'Contiene datos de salud' },
  { value: 'OFFENSIVE', label: 'Es ofensiva' },
  { value: 'FALSE', label: 'Es falsa' },
  { value: 'OTHER', label: 'Otro motivo' },
];

/** «4,7» */
export function formatAverage(value: number): string {
  return value.toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function opinionsLabel(count: number): string {
  return count === 1 ? '1 opinión' : `${count} opiniones`;
}

/** Lo que el filtro automático encontró en un texto (para quien modera). */
export const REVIEW_FLAG_LABELS: Record<string, string> = {
  PHONE: 'teléfono',
  EMAIL: 'correo',
  LINK: 'enlace',
  ID_NUMBER: 'cédula',
  INSULT: 'insulto o acusación',
  HEALTH: 'datos de salud',
};

export const REPORT_REASON_LABEL: Record<ReviewReportReason, string> = Object.fromEntries(
  REPORT_REASONS.map((reason) => [reason.value, reason.label]),
) as Record<ReviewReportReason, string>;

export const REPORT_STATUS_LABEL: Record<'OPEN' | 'UPHELD' | 'DISMISSED', string> = {
  OPEN: 'Abierta',
  UPHELD: 'Procedente',
  DISMISSED: 'Desestimada',
};

export type SanctionType = 'REVIEWS' | 'ACCOUNT';

export interface Sanction {
  id: string;
  type: SanctionType;
  typeLabel: string;
  reason: string;
  startsAt: string;
  endsAt: string | null;
  reviewId: string | null;
  liftedAt: string | null;
  liftReason: string | null;
  active: boolean;
}

/** Atajos de días para sancionar (también se puede escribir otra cantidad de 1 a 365). */
export const SANCTION_PRESET_DAYS = [1, 3, 7, 15, 30, 90];
