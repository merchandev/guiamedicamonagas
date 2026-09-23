import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Titular de una suscripción: un profesional o una organización. Reúne lo
 * necesario para autorizar el pago y avisar al titular del resultado.
 */
export interface SubscriptionOwner {
  kind: 'PROFESSIONAL' | 'ORGANIZATION';
  id: string;
  displayName: string;
  /** Usuarios a notificar (el profesional, o dueños/admins de la organización). */
  recipients: { userId: string; email: string }[];
  whatsapp: string | null;
  dashboardPath: string;
}

type OwnerRef = { professionalId: string | null; organizationId: string | null };

export async function loadSubscriptionOwner(prisma: PrismaService, ref: OwnerRef): Promise<SubscriptionOwner> {
  if (ref.professionalId) {
    const professional = await prisma.professionalProfile.findUnique({
      where: { id: ref.professionalId },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!professional) throw new NotFoundException('Titular de la suscripción no encontrado');
    return {
      kind: 'PROFESSIONAL',
      id: professional.id,
      displayName: professional.firstName,
      recipients: [{ userId: professional.user.id, email: professional.user.email }],
      whatsapp: professional.whatsapp,
      dashboardPath: '/dashboard/pagos',
    };
  }
  const organization = await prisma.organization.findUnique({
    where: { id: ref.organizationId! },
    include: {
      members: { where: { role: { in: ['OWNER', 'ADMIN'] } }, include: { user: { select: { id: true, email: true } } } },
      locations: { select: { whatsapp: true }, take: 1 },
    },
  });
  if (!organization) throw new NotFoundException('Titular de la suscripción no encontrado');
  return {
    kind: 'ORGANIZATION',
    id: organization.id,
    displayName: organization.name,
    recipients: organization.members.map((m) => ({ userId: m.user.id, email: m.user.email })),
    whatsapp: organization.locations[0]?.whatsapp ?? null,
    dashboardPath: '/organizacion/plan',
  };
}

/** ¿Puede este usuario pagar/gestionar la suscripción de este titular? */
export async function userManagesSubscription(prisma: PrismaService, userId: string, ref: OwnerRef): Promise<boolean> {
  if (ref.professionalId) {
    const professional = await prisma.professionalProfile.findUnique({ where: { id: ref.professionalId }, select: { userId: true } });
    return professional?.userId === userId;
  }
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: ref.organizationId!, userId } },
  });
  return !!membership && (membership.role === 'OWNER' || membership.role === 'ADMIN');
}
