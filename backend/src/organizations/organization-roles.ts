import type { OrganizationMemberRole } from '@prisma/client';

/**
 * Qué puede hacer cada rol DENTRO de una organización. Es independiente del
 * rol global de la cuenta (User.role): una misma persona puede ser paciente o
 * médico y, a la vez, editora de una clínica.
 */
export type OrganizationAction =
  /** Ver el panel, el equipo (solo lectura) y las estadísticas. */
  | 'VIEW'
  /** Descripción, horarios, servicios, aseguradoras, métodos de pago, sedes, redes y logo. */
  | 'EDIT_CONTENT'
  /** Nombre, tipo y RIF: la identidad legal verificada. */
  | 'EDIT_IDENTITY'
  /** Invitar y retirar médicos asociados. */
  | 'MANAGE_PROFESSIONALS'
  /** Invitar miembros al equipo (y revocar invitaciones). */
  | 'INVITE_MEMBERS'
  /** Plan de la organización y reporte de pagos. */
  | 'MANAGE_BILLING'
  /** Cambiar roles, transferir la propiedad. */
  | 'MANAGE_ROLES';

export const ORGANIZATION_ROLE_ACTIONS: Record<OrganizationMemberRole, readonly OrganizationAction[]> = {
  OWNER: ['VIEW', 'EDIT_CONTENT', 'EDIT_IDENTITY', 'MANAGE_PROFESSIONALS', 'INVITE_MEMBERS', 'MANAGE_BILLING', 'MANAGE_ROLES'],
  ADMIN: ['VIEW', 'EDIT_CONTENT', 'MANAGE_PROFESSIONALS', 'INVITE_MEMBERS', 'MANAGE_BILLING'],
  EDITOR: ['VIEW', 'EDIT_CONTENT'],
};

export function canOrg(role: OrganizationMemberRole, action: OrganizationAction): boolean {
  return ORGANIZATION_ROLE_ACTIONS[role].includes(action);
}

/** Roles que un miembro puede otorgar al invitar: nadie invita a alguien por encima de sí mismo. */
export function invitableRoles(inviter: OrganizationMemberRole): OrganizationMemberRole[] {
  if (inviter === 'OWNER') return ['ADMIN', 'EDITOR'];
  if (inviter === 'ADMIN') return ['EDITOR'];
  return [];
}

/**
 * ¿Puede `actor` retirar del equipo a alguien con rol `target`? El dueño puede
 * retirar a cualquiera (conservando al menos un dueño, que valida el servicio);
 * un admin, solo a editores.
 */
export function canRemoveMember(actor: OrganizationMemberRole, target: OrganizationMemberRole): boolean {
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return target === 'EDITOR';
  return false;
}
