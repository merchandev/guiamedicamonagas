import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * SEC-03 — autorización por permiso, no por "es admin". Cada endpoint
 * administrativo declara QUÉ necesita; cada rol declara QUÉ puede. No hay
 * atajos: SUPERADMIN también pasa por esta tabla.
 */
export enum Permission {
  VERIFY_PROFESSIONALS = 'VERIFY_PROFESSIONALS',
  /** Ver la foto de identificación y la cédula de un paciente para verificarlo (auditado). */
  VERIFY_PATIENT_IDENTITY = 'VERIFY_PATIENT_IDENTITY',
  REVIEW_PAYMENTS = 'REVIEW_PAYMENTS',
  MANAGE_ORGANIZATIONS = 'MANAGE_ORGANIZATIONS',
  MANAGE_CATALOG = 'MANAGE_CATALOG',
  MANAGE_PLANS = 'MANAGE_PLANS',
  MANAGE_SITE = 'MANAGE_SITE',
  VIEW_ADMIN_STATS = 'VIEW_ADMIN_STATS',
}

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  USER: [],
  PROFESSIONAL: [],
  ORGANIZATION: [],
  ADMIN: [
    Permission.VERIFY_PROFESSIONALS,
    Permission.VERIFY_PATIENT_IDENTITY,
    Permission.REVIEW_PAYMENTS,
    Permission.MANAGE_ORGANIZATIONS,
    Permission.MANAGE_CATALOG,
    Permission.VIEW_ADMIN_STATS,
  ],
  SUPERADMIN: Object.values(Permission),
};

export function roleHasPermissions(role: Role, required: Permission[]): boolean {
  const granted = ROLE_PERMISSIONS[role] ?? [];
  return required.every((permission) => granted.includes(permission));
}

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
