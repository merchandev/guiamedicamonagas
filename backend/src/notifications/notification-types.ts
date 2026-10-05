import type { Role } from '@prisma/client';

/**
 * Avisos cuyo correo cada usuario puede apagar desde «Notificaciones». El
 * aviso en la campana llega siempre. Los de seguridad, cuenta, verificación,
 * pagos y cambios de citas no están en esta lista: su correo no se apaga.
 */
export const OPTIONAL_EMAIL_TYPES: Record<string, { label: string; roles: readonly Role[] }> = {
  APPOINTMENT_REMINDER: { label: 'Recordatorios de tus citas (un día y dos horas antes)', roles: ['USER'] },
  CONTACT_MESSAGE: { label: 'Mensajes nuevos desde el formulario de tu ficha', roles: ['PROFESSIONAL'] },
  CONTACT_REQUEST: { label: 'Pedidos de contacto de pacientes («Quiero que me contacte»)', roles: ['PROFESSIONAL'] },
  REVIEW_PUBLISHED: { label: 'Opiniones nuevas de tus pacientes', roles: ['PROFESSIONAL'] },
};

export function optionalEmailTypesFor(role: Role): string[] {
  return Object.entries(OPTIONAL_EMAIL_TYPES)
    .filter(([, info]) => info.roles.includes(role))
    .map(([type]) => type);
}

/** Solo rutas internas del sitio («/dashboard/citas»): nunca otra web ni «//dominio». */
export function isInternalLink(link: string | undefined | null): link is string {
  return !!link && link.startsWith('/') && !link.startsWith('//') && !link.includes('\\') && link.length <= 300;
}
