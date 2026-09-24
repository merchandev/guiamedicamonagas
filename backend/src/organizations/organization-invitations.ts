import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OrganizationMember, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

export const INVITATION_TTL_HOURS = 72;

/** Token de 32 bytes para el enlace; en la base de datos solo queda su hash. */
export function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type Tx = Prisma.TransactionClient;

/** Invitación vigente (no aceptada, no revocada, no vencida) o 404. */
export async function findActiveInvitation(tx: Tx, token: string) {
  const invitation = await tx.organizationInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token ?? '') },
    include: { organization: { select: { id: true, name: true, type: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    throw new NotFoundException('La invitación no es válida o ya venció; pide una nueva');
  }
  return invitation;
}

/**
 * Consume la invitación para `user` dentro de una transacción: solo la cuenta
 * con el correo invitado puede aceptarla, y una sola vez (el `updateMany`
 * condicionado la reclama de forma atómica ante dos aceptaciones simultáneas).
 */
export async function consumeInvitation(
  tx: Tx,
  token: string,
  user: { id: string; email: string },
): Promise<{ membership: OrganizationMember; organizationId: string; invitedById: string | null }> {
  const invitation = await findActiveInvitation(tx, token);
  if (invitation.email !== user.email.toLowerCase()) {
    throw new ForbiddenException('Esta invitación es para otro correo; inicia sesión con la cuenta invitada');
  }

  const claimed = await tx.organizationInvitation.updateMany({
    where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { acceptedAt: new Date(), acceptedById: user.id },
  });
  if (claimed.count === 0) {
    throw new BadRequestException('La invitación ya fue usada');
  }

  const existing = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
  });
  const membership =
    existing ??
    (await tx.organizationMember.create({
      data: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role },
    }));
  return { membership, organizationId: invitation.organizationId, invitedById: invitation.invitedById };
}

/** "maria.perez@correo.com" → "m***@correo.com" (la vista previa no expone el correo completo). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}
