import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationMemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { GeoService } from '../geo/geo.service';
import { slugify } from '../common/utils/slugify';
import { assertValidSocialLinks } from '../subscriptions/plan-tiers';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';
import { AddMemberDto, UpdateOwnOrganizationDto } from './dto/self-service.dto';

const PUBLIC_INCLUDE = {
  locations: true,
  socialLinks: true,
  professionals: {
    where: { status: 'ACCEPTED' as const, professional: { isPublished: true, verificationStatus: 'VERIFIED' as const } },
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

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly geo: GeoService,
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

  // --- Autogestión (cuentas de organización) --------------------------------

  private async membershipOrThrow(userId: string, organizationId: string, roles?: OrganizationMemberRole[]) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    // 404 (no 403) para no confirmar la existencia de organizaciones ajenas.
    if (!membership) throw new NotFoundException('Organización no encontrada');
    if (roles && !roles.includes(membership.role)) {
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
    return { ...(await this.signLogo(org)), myRole: membership.role, maxLocations: await this.maxLocationsFor(org.planTier) };
  }

  async updateOwn(userId: string, organizationId: string, dto: UpdateOwnOrganizationDto) {
    await this.membershipOrThrow(userId, organizationId);
    const org = await this.ensureExists(organizationId);
    await this.validateLocations(dto.locations, await this.maxLocationsFor(org.planTier));
    assertValidSocialLinks(dto.socialLinks ?? [], org.planTier);

    // Cambiar identidad (nombre, tipo, RIF) de una organización ya verificada
    // la devuelve a revisión, como ocurre con los perfiles médicos.
    const identityChanged =
      dto.name.trim() !== org.name || dto.type !== org.type || (dto.rif?.toUpperCase() ?? null) !== org.rif;
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
    await this.membershipOrThrow(userId, organizationId);
    const org = await this.ensureExists(organizationId);
    await this.prisma.organization.update({ where: { id: organizationId }, data: { logoUrl: key } });
    if (org.logoUrl && !/^https?:\/\//.test(org.logoUrl)) {
      await this.storage.deleteObject(org.logoUrl).catch(() => undefined);
    }
    return this.getOwn(userId, organizationId);
  }

  // Miembros

  async listMembers(userId: string, organizationId: string) {
    await this.membershipOrThrow(userId, organizationId);
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      select: { id: true, role: true, createdAt: true, user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMember(userId: string, organizationId: string, dto: AddMemberDto) {
    await this.membershipOrThrow(userId, organizationId, MANAGER_ROLES);
    const target = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!target || target.role !== 'ORGANIZATION') {
      throw new BadRequestException('Esa persona debe crear primero una cuenta de tipo organización con ese correo');
    }
    try {
      await this.prisma.organizationMember.create({ data: { organizationId, userId: target.id, role: dto.role } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esa cuenta ya es miembro de la organización');
      }
      throw error;
    }
    return this.listMembers(userId, organizationId);
  }

  async removeMember(userId: string, organizationId: string, memberId: string) {
    await this.membershipOrThrow(userId, organizationId, ['OWNER']);
    const member = await this.prisma.organizationMember.findUnique({ where: { id: memberId } });
    if (!member || member.organizationId !== organizationId) throw new NotFoundException('Miembro no encontrado');
    if (member.role === 'OWNER') {
      const owners = await this.prisma.organizationMember.count({ where: { organizationId, role: 'OWNER' } });
      if (owners <= 1) throw new BadRequestException('La organización debe conservar al menos un dueño');
    }
    await this.prisma.organizationMember.delete({ where: { id: memberId } });
    return this.listMembers(userId, organizationId);
  }

  // Médicos asociados (la organización invita, el médico acepta)

  async inviteProfessional(userId: string, organizationId: string, professionalId: string) {
    await this.membershipOrThrow(userId, organizationId, MANAGER_ROLES);
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
    await this.membershipOrThrow(userId, organizationId, MANAGER_ROLES);
    await this.prisma.organizationProfessional.deleteMany({ where: { organizationId, professionalId } });
    return this.getOwn(userId, organizationId);
  }

  /** Búsqueda de médicos verificados para invitar (solo datos públicos). */
  async searchProfessionals(userId: string, organizationId: string, query: string) {
    await this.membershipOrThrow(userId, organizationId);
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
