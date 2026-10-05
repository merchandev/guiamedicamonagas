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
