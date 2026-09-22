export const VERIFICATION_LABELS: Record<string, { label: string; tone: 'neutral' | 'pine' | 'gold' | 'red' | 'amber' }> = {
  PENDING: { label: 'Pendiente de documentos', tone: 'neutral' },
  IN_REVIEW: { label: 'En revisión', tone: 'amber' },
  VERIFIED: { label: 'Verificado', tone: 'pine' },
  REJECTED: { label: 'Rechazado', tone: 'red' },
  SUSPENDED: { label: 'Suspendido', tone: 'red' },
};

export const DOCUMENT_STATUS_LABELS: Record<string, { label: string; tone: 'neutral' | 'pine' | 'gold' | 'red' | 'amber' }> = {
  PENDING: { label: 'En revisión', tone: 'amber' },
  APPROVED: { label: 'Aprobado', tone: 'pine' },
  REJECTED: { label: 'Rechazado', tone: 'red' },
  EXPIRED: { label: 'Vencido', tone: 'red' },
};

export const PAYMENT_STATUS_LABELS: Record<string, { label: string; tone: 'neutral' | 'pine' | 'gold' | 'red' | 'amber' }> = {
  PENDING: { label: 'Pendiente de revisión', tone: 'amber' },
  COMPLETED: { label: 'Aprobado', tone: 'pine' },
  REJECTED: { label: 'Rechazado', tone: 'red' },
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, { label: string; tone: 'neutral' | 'pine' | 'gold' | 'red' | 'amber' }> = {
  PENDING: { label: 'Pendiente de pago', tone: 'amber' },
  ACTIVE: { label: 'Activa', tone: 'pine' },
  PAST_DUE: { label: 'Vencida', tone: 'red' },
  CANCELED: { label: 'Cancelada', tone: 'neutral' },
  UNPAID: { label: 'Sin pagar', tone: 'red' },
};

export const PLAN_TIER_LABELS: Record<string, { label: string; tone: 'neutral' | 'pine' | 'gold' | 'red' | 'amber' }> = {
  FREE: { label: 'Perfil Básico', tone: 'neutral' },
  PROFESSIONAL: { label: 'Profesional', tone: 'pine' },
  PROFESSIONAL_PLUS: { label: 'Profesional Plus', tone: 'pine' },
  PREMIUM: { label: 'Premium', tone: 'gold' },
  ORGANIZATION: { label: 'Organización', tone: 'pine' },
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  TITULO_MEDICO: 'Título de Médico Cirujano',
  REGISTRO_MPPS_SACS: 'Registro MPPS (SACS)',
  ARTICULO_8: 'Constancia Artículo 8',
  MATRICULA_COLEGIO_MONAGAS: 'Matrícula Colegio de Médicos Monagas',
  INPREMEDICO: 'Registro INPREMEDICO',
  SOLVENCIA_DEONTOLOGICA: 'Solvencia Deontológica',
  TITULO_POSTGRADO: 'Título de Postgrado',
  CREDENCIAL_ESPECIALIDAD: 'Credencial de Especialidad',
  CEDULA_IDENTIDAD: 'Cédula de Identidad',
  RIF: 'RIF',
};
