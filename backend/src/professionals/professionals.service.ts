import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { profileVerifiedTemplate } from '../mail/mail.templates';
import { AGENDA_MIN_TIER, assertValidSocialLinks, SOCIAL_LINK_LIMITS, tierAtLeast } from '../subscriptions/plan-tiers';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';
import { UpsertLocationDto } from './dto/upsert-location.dto';
import { UpsertSocialLinksDto } from '../common/dto/social-link.dto';

const PUBLIC_LIST_SELECT = {
  id: true,
  slug: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  bio: true,
  mppsNumber: true,
  colmedMonagasNumber: true,
  inpremedicoNumber: true,
  municipality: true,
  whatsapp: true,
  isSpecialist: true,
  planTier: true,
  specialties: { select: { specialty: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.ProfessionalProfileSelect;

/**
 * Oculta los campos "de lujo" del perfil según el plan activo. El aval legal
 * (MPPS/Colmed/INPREMEDICO) NUNCA se oculta: la verificación es obligatoria
 * para publicarse, no un beneficio de pago.
 */
function gateByTier<
  T extends {
    planTier: string;
    photoUrl: string | null;
    bio: string | null;
    whatsapp: string | null;
  },
>(profile: T) {
  const canRich = tierAtLeast(profile.planTier as never, 'PROFESSIONAL');
  const canPlus = tierAtLeast(profile.planTier as never, 'PROFESSIONAL_PLUS');
  return {
    ...profile,
    photoUrl: canRich ? profile.photoUrl : null,
    bio: canRich ? profile.bio : null,
    whatsapp: canRich ? profile.whatsapp : null,
    canReceiveMessages: canPlus,
    isFeatured: profile.planTier === 'PREMIUM',
  };
}

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  private async signPhoto<T extends { photoUrl: string | null }>(profile: T): Promise<T> {
    if (!profile.photoUrl) return profile;
    try {
      const signed = await this.storage.getSignedDownloadUrl(profile.photoUrl, 3600, false);
      return { ...profile, photoUrl: signed };
    } catch {
      return { ...profile, photoUrl: null };
    }
  }

  async findPublicList(params: {
    specialtySlug?: string;
    municipality?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(48, Math.max(1, params.limit ?? 12));

    const where: Prisma.ProfessionalProfileWhereInput = {
      isPublished: true,
      verificationStatus: 'VERIFIED',
      municipality: params.municipality || undefined,
      specialties: params.specialtySlug
        ? { some: { specialty: { slug: params.specialtySlug } } }
        : undefined,
      OR: params.search
        ? [
            { firstName: { contains: params.search, mode: 'insensitive' } },
            { lastName: { contains: params.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.professionalProfile.findMany({
        where,
        select: PUBLIC_LIST_SELECT,
        skip: (page - 1) * limit,
        take: limit,
        // Los planes pagos aparecen primero (Premium > Plus > Profesional > Básico);
        // dentro de cada plan, el verificado más recientemente va primero.
        orderBy: [{ planTier: 'desc' }, { verifiedAt: 'desc' }],
      }),
      this.prisma.professionalProfile.count({ where }),
    ]);

    const shaped = items.map((item) => gateByTier(item));
    const signedItems = await Promise.all(shaped.map((item) => this.signPhoto(item)));
    return { items: signedItems, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findPublicBySlug(slug: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { slug },
      select: {
        ...PUBLIC_LIST_SELECT,
        phone: true,
        address: true,
        latitude: true,
        longitude: true,
        seoTitle: true,
        seoDescription: true,
        seoKeywords: true,
        ogImageUrl: true,
        noIndex: true,
        verifiedAt: true,
        isPublished: true,
        verificationStatus: true,
        locations: true,
        posts: { where: { published: true }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, slug: true, content: true, createdAt: true } },
        socialLinks: { select: { platform: true, url: true } },
        schedule: { select: { id: true, blocks: { select: { id: true }, take: 1 } } },
      },
    });
    if (!profile || !profile.isPublished || profile.verificationStatus !== 'VERIFIED') {
      throw new NotFoundException('Profesional no encontrado');
    }

    const bookingEnabled =
      tierAtLeast(profile.planTier, AGENDA_MIN_TIER) && !!profile.schedule && profile.schedule.blocks.length > 0;
    const canPlus = tierAtLeast(profile.planTier, 'PROFESSIONAL_PLUS');
    // Filtro de defensa: si el plan bajó (ej. suscripción vencida), nunca se
    // muestran más redes/plataformas de las que el plan actual permite,
    // aunque el registro siga guardado por si vuelve a subir de plan.
    const { allowedPlatforms, maxLinks } = SOCIAL_LINK_LIMITS[profile.planTier];
    const socialLinks = profile.socialLinks
      .filter((link) => allowedPlatforms.includes(link.platform))
      .slice(0, maxLinks);

    const { schedule: _schedule, ...profileWithoutSchedule } = profile;
    const shaped = {
      ...gateByTier(profileWithoutSchedule),
      locations: canPlus ? profile.locations : [],
      posts: canPlus ? profile.posts : [],
      socialLinks,
      bookingEnabled,
    };
    return this.signPhoto(shaped);
  }

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      include: {
        specialties: { include: { specialty: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        locations: { orderBy: { createdAt: 'asc' } },
        socialLinks: true,
        subscriptions: {
          include: { plan: true, installments: { include: { payments: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    return this.signPhoto(profile);
  }

  async updateOwnProfile(userId: string, dto: UpdateProfessionalProfileDto) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');

    const { specialtyIds, ...rest } = dto;
    const isSpecialist = (specialtyIds?.length ?? 0) > 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (specialtyIds) {
        await tx.professionalSpecialty.deleteMany({ where: { professionalId: profile.id } });
        if (specialtyIds.length > 0) {
          await tx.professionalSpecialty.createMany({
            data: specialtyIds.map((specialtyId) => ({ professionalId: profile.id, specialtyId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.professionalProfile.update({
        where: { id: profile.id },
        data: {
          ...rest,
          isSpecialist,
          // Cualquier edición sustancial vuelve a poner el perfil en revisión
          // si ya estaba verificado, para que un admin confirme los cambios.
          ...(profile.verificationStatus === 'VERIFIED'
            ? { verificationStatus: 'IN_REVIEW' as const, isPublished: false }
            : {}),
        },
        include: { specialties: { include: { specialty: true } } },
      });
    });

    return this.signPhoto(updated);
  }

  async updateOwnPhoto(userId: string, key: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    const previousKey = profile.photoUrl;
    const updated = await this.prisma.professionalProfile.update({
      where: { id: profile.id },
      data: { photoUrl: key },
    });
    if (previousKey) {
      await this.storage.deleteObject(previousKey).catch(() => undefined);
    }
    return this.signPhoto(updated);
  }

  // --- Sedes adicionales (Profesional Plus en adelante) ----------------

  async listOwnLocations(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    if (!tierAtLeast(profile.planTier, 'PROFESSIONAL_PLUS')) {
      throw new ForbiddenException('Agregar varias sedes requiere el plan Profesional Plus o superior');
    }
    return this.prisma.professionalLocation.findMany({
      where: { professionalId: profile.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addOwnLocation(userId: string, dto: UpsertLocationDto) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    if (!tierAtLeast(profile.planTier, 'PROFESSIONAL_PLUS')) {
      throw new ForbiddenException('Agregar varias sedes requiere el plan Profesional Plus o superior');
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { tier: profile.planTier } });
    const maxExtra = Math.max((plan?.maxLocations ?? 1) - 1, 0);
    const currentCount = await this.prisma.professionalLocation.count({ where: { professionalId: profile.id } });
    if (currentCount >= maxExtra) {
      throw new BadRequestException(`Tu plan permite hasta ${maxExtra} sede(s) adicional(es)`);
    }

    return this.prisma.professionalLocation.create({ data: { professionalId: profile.id, ...dto } });
  }

  async removeOwnLocation(userId: string, locationId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    const location = await this.prisma.professionalLocation.findUnique({ where: { id: locationId } });
    if (!location || location.professionalId !== profile.id) {
      throw new NotFoundException('Sede no encontrada');
    }
    await this.prisma.professionalLocation.delete({ where: { id: locationId } });
    return { message: 'Sede eliminada' };
  }

  // --- Redes sociales / web (Profesional Plus en adelante) -------------

  async setOwnSocialLinks(userId: string, dto: UpsertSocialLinksDto) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    assertValidSocialLinks(dto.links, profile.planTier);

    await this.prisma.$transaction([
      this.prisma.professionalSocialLink.deleteMany({ where: { professionalId: profile.id } }),
      ...(dto.links.length
        ? [
            this.prisma.professionalSocialLink.createMany({
              data: dto.links.map((link) => ({ professionalId: profile.id, platform: link.platform, url: link.url })),
            }),
          ]
        : []),
    ]);

    return this.prisma.professionalSocialLink.findMany({ where: { professionalId: profile.id } });
  }

  // --- Administración -------------------------------------------------

  async adminFindAll(params: { status?: string; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const where: Prisma.ProfessionalProfileWhereInput = {
      verificationStatus: (params.status as never) || undefined,
      OR: params.search
        ? [
            { firstName: { contains: params.search, mode: 'insensitive' } },
            { lastName: { contains: params.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.professionalProfile.findMany({
        where,
        include: {
          user: { select: { email: true, isEmailVerified: true } },
          documents: true,
          specialties: { include: { specialty: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.professionalProfile.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async adminGetOne(id: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, isEmailVerified: true, createdAt: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        specialties: { include: { specialty: true } },
      },
    });
    if (!profile) throw new NotFoundException('Perfil no encontrado');
    return profile;
  }

  async adminSetSuspended(id: string, suspended: boolean, note: string | undefined, adminId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { id }, include: { user: true } });
    if (!profile) throw new NotFoundException('Perfil no encontrado');
    if (suspended && profile.verificationStatus !== 'VERIFIED' && profile.verificationStatus !== 'SUSPENDED') {
      throw new ForbiddenException('Solo se pueden suspender perfiles verificados');
    }

    const updated = await this.prisma.professionalProfile.update({
      where: { id },
      data: suspended
        ? { verificationStatus: 'SUSPENDED', isPublished: false, rejectionReason: note }
        : { verificationStatus: 'VERIFIED', isPublished: true, rejectionReason: null },
    });

    await this.notifications.notify({
      userId: profile.userId,
      type: suspended ? 'PROFILE_SUSPENDED' : 'PROFILE_REINSTATED',
      title: suspended ? 'Tu perfil fue suspendido' : 'Tu perfil fue reactivado',
      content: note ?? (suspended ? 'Tu perfil fue suspendido por el equipo de Guía Médica Monagas.' : 'Tu perfil fue reactivado y vuelve a estar visible.'),
      email: !suspended
        ? {
            to: profile.user.email,
            subject: 'Tu perfil fue reactivado — Guía Médica Monagas',
            html: profileVerifiedTemplate(profile.firstName, `${process.env.FRONTEND_URL}/medicos/${profile.slug}`),
            template: 'profile_reinstated',
          }
        : undefined,
    });

    return updated;
  }
}
