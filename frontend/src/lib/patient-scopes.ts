export type PatientDataScope = 'IDENTITY' | 'CONTACT' | 'HEALTH';

export const SCOPE_INFO: Record<PatientDataScope, { label: string; description: string }> = {
  IDENTITY: { label: 'Nombre', description: 'Tu nombre y apellido.' },
  CONTACT: { label: 'Contacto', description: 'Tu teléfono y tus datos de contacto y dirección de emergencia.' },
  HEALTH: {
    label: 'Salud',
    description: 'Fecha de nacimiento, sexo, grupo sanguíneo, alergias, condición, medicamentos y médicos tratantes.',
  },
};

export const ALL_SCOPES = Object.keys(SCOPE_INFO) as PatientDataScope[];
