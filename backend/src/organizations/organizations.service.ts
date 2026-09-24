import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationMemberRole, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';
import { MailService } from '../mail/mail.service';
import { organizationInvitationTemplate } from '../mail/mail.templates';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { GeoService } from '../geo/geo.service';
import { slugify } from '../common/utils/slugify';
import { assertValidSocialLinks } from '../subscriptions/plan-tiers';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';
import { InviteMemberDto, UpdateOwnOrganizationDto } from './dto/self-service.dto';
import {
  canOrg,
  canRemoveMember,
  invitableRoles,
  ORGANIZATION_ROLE_ACTIONS,
  type OrganizationAction,
} from './organization-roles';
import {
  consumeInvitation,
  findActiveInvitation,
  INVITATION_TTL_HOURS,
  maskEmail,
  newInvitationToken,
} from './organization-invitations';

const PUBLIC_INCLUDE = {
  locations: true,
  socialLinks: true,
  professionals: {
    where: { status: 'ACCEPTED' as const, professional: { isPublished: true } },
    select: {
      professional: {
        select: {
          id: true,
          slug: true,
          firstName: true,
          lastName: true,
          specialties: { select: { specialty: { select: { name: true, slug: true } } } },
        },
      },
    },
  },
} satisfies Prisma.OrganizationInclude;

const MANAGER_ROLES: OrganizationMemberRole[] = ['OWNER', 'ADMIN'];

const ROLE_LABELS: Record<OrganizationMemberRole, string> = { OWNER: 'Dueño', ADMIN: 'Administrador', EDITOR: 'Editor' };

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly geo: GeoService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** Logo subido (clave privada) → URL firmada; un logo externo (http) se deja tal cual. */
  private async signLogo<T extends { logoUrl: string | null }>(org: T): Promise<T> {
    if (!org.logoUrl || /^https?:\/\//.test(org.logoUrl)) return org;
    const signed = await this.storage.getSignedDownloadUrl(org.logoUrl, 3600, false).catch(() => null);
    return { ...org, logoUrl: signed };
  }

  // --- Público ---------------------------------------------------------------

  async findAll(type?: 'PHARMACY' | 'LABORATORY' | 'CLINIC', municipality?: string) {
    const orgs = await this.prisma.organization.findMany({
      where: {
        isPublished: true,
        verificationStatus: 'VERIFIED',
        type,
        locations: municipality ? { some: { municipality } } : undefined,
      },
      include: PUBLIC_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return Promise.all(orgs.map((o) => this.signLogo(o)));
  }

  async findBySlug(slug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug }, include: PUBLIC_INCLUDE });
    if (!org || !org.isPublished || org.verificationStatus !== 'VERIFIED') {
      throw new NotFoundException('Organización no encontrada');
    }
    return this.signLogo(org);
  }

  // --- Administración -------------------------------------------------------

  private async maxLocationsFor(planTier: 'ORGANIZATION' | string) {
    if (planTier !== 'ORGANIZATION') return 1;
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { tier: 'ORGANIZATION' } });
    return plan?.maxLocations ?? 4;
  }

  private async validateLocations(locations: { municipality?: string }[], max: number) {
    if (locations.length > max) {
      throw new BadRequestException(
        max === 1
          ? 'El perfil gratuito permite 1 sede; el plan de organizaciones permite más'
          : `El plan de organizaciones permite hasta ${max} sedes`,
      );
    }
    for (const location of locations) await this.geo.assertValidMunicipality(location.municipality);
  }

  adminList(status?: string) {
    return this.prisma.organization.findMany({
      where: { verificationStatus: (status as never) || undefined },
      include: { locations: true, socialLinks: true, members: { include: { user: { select: { email: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: UpsertOrganizationDto) {
    await this.validateLocations(dto.locations, await this.maxLocationsFor('ORGANIZATION'));
    assertValidSocialLinks(dto.socialLinks ?? [], 'ORGANIZATION');
    const slug = slugify(dto.name);
    const exists = await this.prisma.organization.findUnique({ where: { slug } });
    if (exists) throw new ConflictException('Ya existe una organización con ese nombre');
    return this.prisma.organization.create({
      data: {
        type: dto.type,
        name: dto.name,
        slug,
        description: dto.description,
        logoUrl: dto.logoUrl,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        locations: { create: dto.locations },
        socialLinks: dto.socialLinks?.length ? { create: dto.socialLinks } : undefined,
      },
      include: { locations: true, socialLinks: true },
    });
  }

  async update(id: string, dto: UpsertOrganizationDto) {
    await this.ensureExists(id);
    await this.validateLocations(dto.locations, await this.maxLocationsFor('ORGANIZATION'));
    assertValidSocialLinks(dto.socialLinks ?? [], 'ORGANIZATION');
    return this.prisma.$transaction(async (tx) => {
      await tx.organizationLocation.deleteMany({ where: { organizationId: id } });
      await tx.organizationSocialLink.deleteMany({ where: { organizationId: id } });
      return tx.organization.update({
        where: { id },
        data: {
          type: dto.type,
          name: dto.name,
          description: dto.description,
          logoUrl: dto.logoUrl,
          locations: { create: dto.locations },
          socialLinks: dto.socialLinks?.length ? { create: dto.socialLinks } : undefined,
        },
        include: { locations: true, socialLinks: true },
      });
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.organization.delete({ where: { id } });
    return { message: 'Organización eliminada' };
  }

  async setPublished(id: string, isPublished: boolean) {
    const org = await this.ensureExists(id);
    if (isPublished && org.verificationStatus !== 'VERIFIED') {
      throw new BadRequestException('Solo se pueden publicar organizaciones verificadas');
    }
    return this.prisma.organization.update({ where: { id }, data: { isPublished } });
  }

  /** Aprobación/rechazo de una organización que se registró sola. */
  async review(id: string, adminId: string, approved: boolean, note: string | undefined, ipAddress?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { members: { where: { role: { in: MANAGER_ROLES } }, include: { user: { select: { id: true } } } } },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    if (!approved && !note) throw new BadRequestException('Indica el motivo del rechazo');
    if (approved) {
      const locations = await this.prisma.organizationLocation.count({ where: { organizationId: id } });
      if (locations === 0) throw new BadRequestException('La organización debe cargar al menos una sede antes de publicarse');
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: approved
        ? { verificationStatus: 'VERIFIED', verifiedAt: new Date(), isPublished: true, rejectionReason: null }
        : { verificationStatus: 'REJECTED', isPublished: false, rejectionReason: note },
    });

    await this.audit.record({
      userId: adminId,
      action: approved ? 'ORGANIZATION_VERIFIED' : 'ORGANIZATION_REJECTED',
      resource: 'Organization',
      resourceId: id,
      details: { note },
      ipAddress,
    });

    for (const member of org.members) {
      await this.notifications.notify({
        userId: member.user.id,
        type: approved ? 'ORGANIZATION_VERIFIED' : 'ORGANIZATION_REJECTED',
        title: approved ? 'Tu organización fue verificada' : 'Tu organización necesita correcciones',
        content: approved ? `${org.name} ya aparece en el directorio.` : `Motivo: ${note}`,
      });
    }
    return updated;
  }

  private async ensureExists(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  // --- Autogestión (miembros del equipo de una organización) --------------------
  //
  // La autorización es la pertenencia (OrganizationMember) y su rol dentro de
  // la organización — ver organization-roles.ts —, no el rol global de la cuenta.

  private async membershipOrThrow(userId: string, organizationId: string, action: OrganizationAction = 'VIEW') {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    // 404 (no 403) para no confirmar la existencia de organizaciones ajenas.
    if (!membership) throw new NotFoundException('Organización no encontrada');
    if (!canOrg(membership.role, action)) {
      throw new ForbiddenException('Tu rol en la organización no permite esta acción');
    }
    return membership;
  }

  async listOwn(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: { select: { id: true, slug: true, name: true, type: true, verificationStatus: true, planTier: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({ role: m.role, ...m.organization }));
  }

  async getOwn(userId: string, organizationId: string) {
    const membership = await this.membershipOrThrow(userId, organizationId);
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: {
        locations: { orderBy: { createdAt: 'asc' } },
        socialLinks: true,
        professionals: {
          include: { professional: { select: { id: true, slug: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return {
      ...(await this.signLogo(org)),
      myRole: membership.role,
      myActions: ORGANIZATION_ROLE_ACTIONS[membership.role],
      invitableRoles: invitableRoles(membership.role),
      maxLocations: await this.maxLocationsFor(org.planTier),
    };
  }

  async updateOwn(userId: string, organizationId: string, dto: UpdateOwnOrganizationDto) {
    const membership = await this.membershipOrThrow(userId, organizationId, 'EDIT_CONTENT');
    const org = await this.ensureExists(organizationId);

    // Nombre, tipo y RIF son la identidad legal verificada: solo el dueño los
    // cambia, y hacerlo devuelve una organización verificada a revisión.
    const identityChanged =
      dto.name.trim() !== org.name || dto.type !== org.type || (dto.rif?.toUpperCase() ?? null) !== org.rif;
    if (identityChanged && !canOrg(membership.role, 'EDIT_IDENTITY')) {
      throw new ForbiddenException('Solo el dueño puede cambiar el nombre, el tipo o el RIF de la organización');
    }
    await this.validateLocations(dto.locations, await this.maxLocationsFor(org.planTier));
    assertValidSocialLinks(dto.socialLinks ?? [], org.planTier);
    const backToReview = identityChanged && org.verificationStatus === 'VERIFIED';

    await this.prisma.$transaction(async (tx) => {
      await tx.organizationLocation.deleteMany({ where: { organizationId } });
      await tx.organizationSocialLink.deleteMany({ where: { organizationId } });
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          type: dto.type,
          name: dto.name.trim(),
          description: dto.description,
          rif: dto.rif?.toUpperCase() ?? null,
          openingHours: dto.openingHours,
          services: (dto.services ?? []) as Prisma.InputJsonValue,
          insurers: (dto.insurers ?? []) as Prisma.InputJsonValue,
          paymentMethods: (dto.paymentMethods ?? []) as Prisma.InputJsonValue,
          locations: { create: dto.locations },
          socialLinks: dto.socialLinks?.length ? { create: dto.socialLinks } : undefined,
          ...(backToReview ? { verificationStatus: 'IN_REVIEW' as const, isPublished: false } : {}),
          ...(org.verificationStatus === 'REJECTED' ? { verificationStatus: 'IN_REVIEW' as const } : {}),
        },
      });
    });
    return this.getOwn(userId, organizationId);
  }

  async updateOwnLogo(userId: string, organizationId: string, key: string) {
    await this.membershipOrThrow(userId, organizationId, 'EDIT_CONTENT');
    const org = await this.ensureExists(organizationId);
    await this.prisma.organization.update({ where: { id: organizationId }, data: { logoUrl: key } });
    if (org.logoUrl && !/^https?:\/\//.test(org.logoUrl)) {
      await this.storage.deleteObject(org.logoUrl).catch(() => undefined);
    }
    return this.getOwn(userId, organizationId);
  }

  // Equipo

  async listMembers(userId: string, organizationId: string) {
    await this.membershipOrThrow(userId, organizationId);
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      select: { id: true, role: true, createdAt: true, userId: true, user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async removeMember(userId: string, organizationId: string, memberId: string, ipAddress?: string) {
    const actor = await this.membershipOrThrow(userId, organizationId);
    const member = await this.prisma.organizationMember.findUnique({ where: { id: memberId } });
    if (!member || member.organizationId !== organizationId) throw new NotFoundException('Miembro no encontrado');
    if (!canRemoveMember(actor.role, member.role)) {
      throw new ForbiddenException('Tu rol en la organización no permite retirar a este miembro');
    }
    await this.assertKeepsAnOwner(organizationId, member.role, null);
    await this.prisma.organizationMember.delete({ where: { id: memberId } });
    await this.audit.record({
      userId,
      action: 'ORGANIZATION_MEMBER_REMOVED',
      resource: 'Organization',
      resourceId: organizationId,
      details: { memberUserId: member.userId, role: member.role },
      ipAddress,
    });
    return this.listMembers(userId, organizationId);
  }

  /** Cambiar el rol de un miembro; ascender a otro a dueño es la forma de transferir la propiedad. */
  async changeMemberRole(
    userId: string,
    organizationId: string,
    memberId: string,
    role: OrganizationMemberRole,
    ipAddress?: string,
  ) {
    await this.membershipOrThrow(userId, organizationId, 'MANAGE_ROLES');
    const member = await this.prisma.organizationMember.findUnique({ where: { id: memberId } });
    if (!member || member.organizationId !== organizationId) throw new NotFoundException('Miembro no encontrado');
    if (member.role === role) return this.listMembers(userId, organizationId);
    await this.assertKeepsAnOwner(organizationId, member.role, role);
    await this.prisma.organizationMember.update({ where: { id: memberId }, data: { role } });
    await this.audit.record({
      userId,
      action: 'ORGANIZATION_MEMBER_ROLE_CHANGED',
      resource: 'Organization',
      resourceId: organizationId,
      details: { memberUserId: member.userId, from: member.role, to: role },
      ipAddress,
    });
    return this.listMembers(userId, organizationId);
  }

  /** Quitar o degradar a un dueño nunca puede dejar a la organización sin dueño. */
  private async assertKeepsAnOwner(
    organizationId: string,
    currentRole: OrganizationMemberRole,
    newRole: OrganizationMemberRole | null,
  ) {
    if (currentRole !== 'OWNER' || newRole === 'OWNER') return;
    const owners = await this.prisma.organizationMember.count({ where: { organizationId, role: 'OWNER' } });
    if (owners <= 1) throw new BadRequestException('La organización debe conservar al menos un dueño');
  }

  // Invitaciones al equipo

  async inviteMember(userId: string, organizationId: string, dto: InviteMemberDto, ipAddress?: string) {
    const actor = await this.membershipOrThrow(userId, organizationId, 'INVITE_MEMBERS');
    if (!invitableRoles(actor.role).includes(dto.role)) {
      throw new ForbiddenException('No puedes invitar a alguien con un rol igual o superior al tuyo');
    }
    const email = dto.email.trim().toLowerCase();
    const alreadyMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId, user: { email } },
      select: { id: true },
    });
    if (alreadyMember) throw new ConflictException('Esa cuenta ya es miembro de la organización');

    const org = await this.ensureExists(organizationId);
    const { token, tokenHash } = newInvitationToken();
    const now = new Date();
    await this.prisma.$transaction([
      // Reinvitar reemplaza el enlace anterior: solo el último sirve.
      this.prisma.organizationInvitation.updateMany({
        where: { organizationId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.organizationInvitation.create({
        data: {
          organizationId,
          email,
          role: dto.role,
          tokenHash,
          invitedById: userId,
          expiresAt: new Date(now.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000),
        },
      }),
    ]);

    await this.audit.record({
      userId,
      action: 'ORGANIZATION_INVITATION_SENT',
      resource: 'Organization',
      resourceId: organizationId,
      details: { email, role: dto.role },
      ipAddress,
    });

    const acceptUrl = `${this.config.get('FRONTEND_URL', { infer: true })}/invitacion-organizacion?token=${token}`;
    const existingUser = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    const email$ = {
      to: email,
      subject: `Invitación a ${org.name} — Guía Médica Monagas`,
      template: 'organization_invitation',
      html: organizationInvitationTemplate(org.name, ROLE_LABELS[dto.role], acceptUrl, INVITATION_TTL_HOURS),
    };
    if (existingUser) {
      await this.notifications.notify({
        userId: existingUser.id,
        type: 'ORGANIZATION_INVITATION',
        title: `Invitación a ${org.name}`,
        content: `Te invitaron como ${ROLE_LABELS[dto.role].toLowerCase()}. Revisa tu correo para aceptar.`,
        email: email$,
      });
    } else {
      await this.mail.send(email$);
    }
    return this.listInvitations(userId, organizationId);
  }

  async listInvitations(userId: string, organizationId: string) {
    await this.membershipOrThrow(userId, organizationId, 'INVITE_MEMBERS');
    return this.prisma.organizationInvitation.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedBy: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvitation(userId: string, organizationId: string, invitationId: string, ipAddress?: string) {
    await this.membershipOrThrow(userId, organizationId, 'INVITE_MEMBERS');
    const revoked = await this.prisma.organizationInvitation.updateMany({
      where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw new NotFoundException('Invitación no encontrada');
    await this.audit.record({
      userId,
      action: 'ORGANIZATION_INVITATION_REVOKED',
      resource: 'Organization',
      resourceId: organizationId,
      details: { invitationId },
      ipAddress,
    });
    return this.listInvitations(userId, organizationId);
  }

  /** Vista previa pública del enlace: organización y rol, sin revelar el correo completo. */
  async previewInvitation(token: string) {
    const invitation = await findActiveInvitation(this.prisma, token);
    const accountExists = !!(await this.prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } }));
    return {
      organizationName: invitation.organization.name,
      organizationType: invitation.organization.type,
      role: invitation.role,
      email: maskEmail(invitation.email),
      expiresAt: invitation.expiresAt,
      accountExists,
    };
  }

  /** Una cuenta ya existente (de cualquier tipo) acepta la invitación enviada a su correo. */
  async acceptInvitation(user: { id: string; email: string }, token: string, ipAddress?: string) {
    const result = await this.prisma.$transaction((tx) => consumeInvitation(tx, token, user));
    await this.audit.record({
      userId: user.id,
      action: 'ORGANIZATION_INVITATION_ACCEPTED',
      resource: 'Organization',
      resourceId: result.organizationId,
      details: { role: result.membership.role },
      ipAddress,
    });
    if (result.invitedById) {
      await this.notifications.notify({
        userId: result.invitedById,
        type: 'ORGANIZATION_INVITATION_ACCEPTED',
        title: 'Invitación aceptada',
        content: `${user.email} se unió al equipo como ${ROLE_LABELS[result.membership.role].toLowerCase()}.`,
      });
    }
    return { organizationId: result.organizationId, role: result.membership.role };
  }

  // Médicos asociados (la organización invita, el médico acepta)

  async inviteProfessional(userId: string, organizationId: string, professionalId: string) {
    await this.membershipOrThrow(userId, organizationId, 'MANAGE_PROFESSIONALS');
    const org = await this.ensureExists(organizationId);
    if (org.planTier !== 'ORGANIZATION') {
      throw new ForbiddenException('Asociar médicos es un beneficio del plan de organizaciones');
    }
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalId },
      select: { id: true, userId: true, verificationStatus: true },
    });
    if (!professional || professional.verificationStatus !== 'VERIFIED') {
      throw new NotFoundException('Profesional no encontrado');
    }
    await this.prisma.organizationProfessional.upsert({
      where: { organizationId_professionalId: { organizationId, professionalId } },
      create: { organizationId, professionalId },
      update: {},
    });
    await this.notifications.notify({
      userId: professional.userId,
      type: 'ORGANIZATION_AFFILIATION_INVITE',
      title: 'Invitación de una organización',
      content: `${org.name} quiere mostrarte como médico asociado. Acepta o rechaza desde tu perfil.`,
    });
    return this.getOwn(userId, organizationId);
  }

  async removeProfessional(userId: string, organizationId: string, professionalId: string) {
    await this.membershipOrThrow(userId, organizationId, 'MANAGE_PROFESSIONALS');
    await this.prisma.organizationProfessional.deleteMany({ where: { organizationId, professionalId } });
    return this.getOwn(userId, organizationId);
  }

  /** Búsqueda de médicos verificados para invitar (solo datos públicos). */
  async searchProfessionals(userId: string, organizationId: string, query: string) {
    await this.membershipOrThrow(userId, organizationId, 'MANAGE_PROFESSIONALS');
    if (!query || query.trim().length < 2) return [];
    return this.prisma.professionalProfile.findMany({
      where: {
        isPublished: true,
        verificationStatus: 'VERIFIED',
        OR: [
          { firstName: { contains: query.trim(), mode: 'insensitive' } },
          { lastName: { contains: query.trim(), mode: 'insensitive' } },
        ],
      },
      select: { id: true, slug: true, firstName: true, lastName: true, municipality: true },
      take: 10,
    });
  }

  async stats(userId: string, organizationId: string) {
    await this.membershipOrThrow(userId, organizationId);
    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['eventType'],
      where: { resourceId: organizationId },
      _count: { _all: true },
    });
    return Object.fromEntries(grouped.map((g) => [g.eventType, g._count._all]));
  }

  // --- Lado del médico: invitaciones recibidas ---------------------------------

  async listAffiliationsForProfessional(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    return this.prisma.organizationProfessional.findMany({
      where: { professionalId: profile.id },
      include: { organization: { select: { id: true, slug: true, name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async respondAffiliation(userId: string, organizationId: string, accept: boolean) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    const link = await this.prisma.organizationProfessional.findUnique({
      where: { organizationId_professionalId: { organizationId, professionalId: profile.id } },
    });
    if (!link) throw new NotFoundException('Invitación no encontrada');
    if (accept) {
      await this.prisma.organizationProfessional.update({
        where: { organizationId_professionalId: { organizationId, professionalId: profile.id } },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
    } else {
      await this.prisma.organizationProfessional.delete({
        where: { organizationId_professionalId: { organizationId, professionalId: profile.id } },
      });
    }
    return this.listAffiliationsForProfessional(userId);
  }
}
