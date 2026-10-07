// Tipos y textos de la agenda del médico (calendario, historial y detalle).

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type AppointmentSource = 'WEB' | 'WHATSAPP' | 'APP' | 'PHONE';
export type Party = 'PATIENT' | 'PROFESSIONAL';

/** El paciente tal como lo puede ver el médico (según lo que autorizó). */
export interface PatientLabel {
  patientId: string;
  patientCode: string;
  name: string | null;
  phone: string | null;
  access: 'WALK_IN' | 'GRANT' | 'NONE';
  hasAccount: boolean;
}

export interface AgendaAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  reason: string | null;
  cancellationReason: string | null;
  cancelledBy: Party | null;
  createdAt: string;
  location: { id: string; name: string } | null;
  patient: PatientLabel;
}

export interface AppointmentEventItem {
  type: 'CREATED' | 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  actor: 'PATIENT' | 'PROFESSIONAL' | 'SYSTEM' | 'ADMIN';
  previousStartsAt: string | null;
  newStartsAt: string | null;
  outsideSchedule: boolean;
  createdAt: string;
}

export interface AppointmentDetail extends AgendaAppointment {
  events: AppointmentEventItem[];
}

export interface CalendarDay {
  date: string;
  special: boolean;
  open: { start: string; end: string }[];
  blocked: { id: string | null; start: string; end: string; allDay: boolean; reason: string | null }[];
}

export interface ScheduleSettings {
  slotDurationMinutes: number;
  bufferMinutes: number;
  maxDailyAppointments: number | null;
  autoConfirm: boolean;
  bookingWindowDays: number;
  minNoticeMinutes: number;
}

export interface CalendarData {
  /** Sin plan: se ven y se gestionan las citas ya reservadas, pero no llegan ni se crean citas nuevas. */
  planActive: boolean;
  settings: ScheduleSettings | null;
  days: CalendarDay[];
  appointments: AgendaAppointment[];
}

export interface HistoryPage {
  items: AgendaAppointment[];
  nextCursor: string | null;
  summary: Record<AppointmentStatus, number> | null;
}

export const STATUS_INFO: Record<
  AppointmentStatus,
  { label: string; tone: 'neutral' | 'pine' | 'gold' | 'red' | 'amber'; color: string; text: string }
> = {
  PENDING: { label: 'Por confirmar', tone: 'amber', color: '#b45309', text: '#ffffff' },
  CONFIRMED: { label: 'Confirmada', tone: 'pine', color: '#0f6e5c', text: '#ffffff' },
  COMPLETED: { label: 'Realizada', tone: 'neutral', color: '#475569', text: '#ffffff' },
  CANCELLED: { label: 'Cancelada', tone: 'red', color: '#b91c1c', text: '#ffffff' },
  NO_SHOW: { label: 'No asistió', tone: 'red', color: '#7f1d1d', text: '#ffffff' },
};

export const STATUS_OPTIONS = (Object.keys(STATUS_INFO) as AppointmentStatus[]).map((value) => ({
  value,
  label: STATUS_INFO[value].label,
}));

export const SOURCE_LABELS: Record<AppointmentSource, string> = {
  WEB: 'Reservada en la web',
  WHATSAPP: 'WhatsApp',
  APP: 'Aplicación',
  PHONE: 'Cargada por ti',
};

/** Nombre si el paciente lo autorizó; si no, su código. */
export function patientDisplay(patient: PatientLabel): string {
  return patient.name ?? patient.patientCode;
}

/** Se puede mover o cancelar mientras no haya pasado ni terminado. */
export function isActive(appointment: Pick<AgendaAppointment, 'status'>): boolean {
  return appointment.status === 'PENDING' || appointment.status === 'CONFIRMED';
}

const ACTOR_TEXT: Record<AppointmentEventItem['actor'], string> = {
  PATIENT: 'el paciente',
  PROFESSIONAL: 'ti',
  SYSTEM: 'el sistema',
  ADMIN: 'la administración',
};

/** Texto de cada paso del historial de una cita. */
export function eventText(event: AppointmentEventItem): string {
  const by = ACTOR_TEXT[event.actor];
  switch (event.type) {
    case 'CREATED':
      return event.actor === 'PROFESSIONAL' ? 'La cargaste tú' : `La pidió ${by}`;
    case 'CONFIRMED':
      return `Confirmada por ${by}`;
    case 'RESCHEDULED':
      return `Reprogramada por ${by}`;
    case 'CANCELLED':
      return `Cancelada por ${by}`;
    case 'COMPLETED':
      return 'Marcada como realizada';
    case 'NO_SHOW':
      return 'Marcada como «no asistió»';
  }
}
