import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

export const SESSION_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  tokenVersion: true,
  suspendedUntil: true,
} as const satisfies Prisma.UserSelect;

export type SessionUserRow = Prisma.UserGetPayload<{ select: typeof SESSION_USER_SELECT }>;

/**
 * SEC-02: la firma del token no basta. Debe corresponder a la versión de sesión
 * vigente y a una cuenta activa, y el rol sale de la base de datos, no del
 * token. Lo usan las peticiones HTTP (JwtStrategy) y el canal en tiempo real.
 */
export function sessionUserFrom(row: SessionUserRow | null, tokenVersion = 0, now = new Date()): AuthenticatedUser | null {
  // Una suspensión temporal (sanción) también corta la sesión mientras dura.
  const suspended = !!row?.suspendedUntil && row.suspendedUntil > now;
  if (!row || !row.isActive || suspended || tokenVersion !== row.tokenVersion) return null;
  return { id: row.id, email: row.email, role: row.role };
}
