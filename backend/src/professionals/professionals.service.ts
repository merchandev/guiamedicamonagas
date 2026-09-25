import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, RegistrationType } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { profilePublishedTemplate, profileVerifiedTemplate } from '../mail/mail.templates';
import { AGENDA_MIN_TIER, assertValidSocialLinks, SOCIAL_LINK_LIMITS, tierAtLeast } from '../subscriptions/plan-tiers';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';
import { UpsertLocationDto } from './dto/upsert-location.dto';
import { UpsertSocialLinksDto } from '../common/dto/social-link.dto';
import { GeoService } from '../geo/geo.service';
import { recomputeDirectoryScore } from './directory-score';
import {
  documentProgress,
  GENERAL_MEDICINE_SLUG,
  professionalChecklist,
  recomputeProfessionalStatus,
} from './publication-rules';
import { notifyProfilePublished } from './publication-notice';
import { assignPublicCode, directorySearchWhere, normalizePublicCode, searchNameFor } from './professional-search.util';

// Emisor de cada número que el médico carga en su perfil (ver ProfessionalRegistration).
const REGISTRATION_SOURCES: {
  field: 'mppsNumber' | 'colmedMonagasNumber' | 'inpremedicoNumber';
  type: RegistrationType;
  issuer: string;
  jurisdiction: string;
}[] = [
  { field: 'mppsNumber', type: 'MPPS_SACS', issuer: 'MPPS (SACS)', jurisdiction: 'Nacional' },
  { field: 'colmedMonagasNumber', type: 'COLEGIO_MEDICOS', issuer: 'Colegio de Médicos del Estado Monagas', jurisdiction: 'Monagas' },
  { field: 'inpremedicoNumber', type: 'INPREMEDICO', issuer: 'INPREMEDICO', jurisdiction: 'Nacional' },
];

const SITEMAP_PAGE_SIZE = 1000;

// Datos que respaldan los documentos: si cambian, el perfil vuelve a revisión.
const IDENTITY_FIELDS = ['firstName', 'lastName', 'cedula', 'rif', 'mppsNumber', 'colmedMonagasNumber'] as const;

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
  verificationStatus: true,
  specialties: { select: { specialty: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.ProfessionalProfileSelect;

/**
 * Oculta los campos "de lujo" del perfil según el plan activo. El aval legal
 * (MPPS/Colmed) NUNCA se oculta: la verificación es obligatoria para
 * publicarse, no un beneficio de pago.
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
export class ProfessionalsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProfessionalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly geo: GeoService,
  ) {}

  /**
   * Mantiene al día el puntaje del directorio (p.ej. tras desplegar un cambio
   * de fórmula), el nombre de búsqueda normalizado y el código público de los
   * perfiles creados antes de que existiera.
   */
  async onApplicationBootstrap() {
    const profiles = await this.prisma.professionalProfile.findMany({
      select: { id: true, firstName: true, lastName: true, searchName: true, publicCode: true },
      take: 5000,
    });
    let codes = 0;
    for (const profile of profiles) {
      await recomputeDirectoryScore(this.prisma, profile.id);
      const searchName = searchNameFor(profile.firstName, profile.lastName);
      if (searchName !== profile.searchName) {
        await this.prisma.professionalProfile.update({ where: { id: profile.id }, data: { searchName } });
      }
      if (!profile.publicCode) {
        await assignPublicCode(this.prisma, profile.id);
        codes += 1;
      }
    }
    if (profiles.length) this.logger.log(`Puntaje de directorio recalculado para ${profiles.length} perfil(es)`);
    if (codes) this.logger.log(`Código público asignado a ${codes} perfil(es)`);
  }

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

    // Solo médicos publicados; la búsqueda usa nombre normalizado, especialidad
    // o código público (ver directorySearchWhere): nada de pacientes ni de datos
    // sensibles del médico.
    const searchWhere = directorySearchWhere(params.search);
    const where: Prisma.ProfessionalProfileWhereInput = {
      isPublished: true,
      municipality: params.municipality || undefined,
      specialties: params.specialtySlug
        ? { some: { specialty: { slug: params.specialtySlug } } }
        : undefined,
      ...(searchWhere ? { AND: [searchWhere] } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.professionalProfile.findMany({
        where,
        select: PUBLIC_LIST_SELECT,
        skip: (page - 1) * limit,
        take: limit,
        // Relevancia = perfil completo + impulso acotado por plan (ver
        // directory-score.ts): pagar da visibilidad etiquetada, no el primer
        // lugar garantizado.
        orderBy: [{ directoryScore: 'desc' }, { verifiedAt: 'desc' }],
      }),
      this.prisma.professionalProfile.count({ where }),
    ]);

    const shaped = items.map((item) => gateByTier(item));
    const signedItems = await Promise.all(shaped.map((item) => this.signPhoto(item)));

    // Franja "Destacado" (patrocinada y rotativa): hasta 3 perfiles Premium
    // que cumplen el mismo filtro, mostrados aparte y señalados como tales.
    let featured: typeof signedItems = [];
    if (page === 1 && !searchWhere) {
      const premiumWhere: Prisma.ProfessionalProfileWhereInput = { ...where, planTier: 'PREMIUM' };
      const premiumCount = await this.prisma.professionalProfile.count({ where: premiumWhere });
      if (premiumCount > 0) {
        const skip = premiumCount > 3 ? Math.floor(Math.random() * (premiumCount - 2)) : 0;
        const rows = await this.prisma.professionalProfile.findMany({ where: premiumWhere, select: PUBLIC_LIST_SELECT, skip, take: 3 });
        featured = await Promise.all(rows.map((row) => this.signPhoto(gateByTier(row))));
      }
    }

    return { items: signedItems, featured, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findPublicBySlug(slug: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { slug },
      select: {
        ...PUBLIC_LIST_SELECT,
        publicCode: true,
        // Resumen corto: alimenta la descripción automática para buscadores.
        seoDescription: true,
        phone: true,
        address: true,
        latitude: true,
        longitude: true,
        noIndex: true,
        verifiedAt: true,
        isPublished: true,
        verificationStatus: true,
        locations: true,
        posts: { where: { published: true }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, slug: true, content: true, createdAt: true } },
        socialLinks: { select: { platform: true, url: true } },
        schedule: { select: { id: true, blocks: { select: { id: true }, take: 1 } } },
        registrations: {
          select: { type: true, issuer: true, jurisdiction: true, number: true, verifiedAt: true },
          orderBy: { type: 'asc' },
        },
        organizations: {
          where: { status: 'ACCEPTED', organization: { isPublished: true, verificationStatus: 'VERIFIED' } },
          select: { organization: { select: { slug: true, name: true, type: true } } },
        },
      },
    });
    if (!profile || !profile.isPublished) {
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

  /**
   * Foto cuadrada en JPEG para la tarjeta al compartir la ficha (WhatsApp,
   * Telegram, redes). Misma regla que la ficha pública: solo si está
   * publicada y su plan muestra la foto. Nada más sale por aquí.
   */
  async sharePhoto(slug: string): Promise<Buffer> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { slug },
      select: { photoUrl: true, isPublished: true, planTier: true },
    });
    if (!profile?.isPublished || !profile.photoUrl || !tierAtLeast(profile.planTier, 'PROFESSIONAL')) {
      throw new NotFoundException('Foto no disponible');
    }
    const original = await this.storage.getObjectBuffer(profile.photoUrl);
    return sharp(original, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(480, 480, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
  }

  /** Código público (texto o QR) → slug de la ficha, solo si está publicada. */
  async findPublicByCode(rawCode: string) {
    const publicCode = normalizePublicCode(rawCode);
    const profile = publicCode
      ? await this.prisma.professionalProfile.findUnique({ where: { publicCode }, select: { slug: true, isPublished: true } })
      : null;
    if (!profile?.isPublished) throw new NotFoundException('Código de médico no encontrado');
    return { slug: profile.slug };
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
        user: { select: { isEmailVerified: true } },
        schedule: { select: { blocks: { select: { id: true }, take: 1 } } },
      },
    });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    const { user, schedule, ...rest } = profile;
    // Igual que en la ficha pública: decide si la descripción para buscadores
    // termina en «Agenda cita.» (la vista previa del panel lo muestra).
    const bookingEnabled = tierAtLeast(profile.planTier, AGENDA_MIN_TIER) && !!schedule && schedule.blocks.length > 0;
    const progress = professionalChecklist({
      ...rest,
      isEmailVerified: user.isEmailVerified,
      specialtyCount: profile.specialties.length,
      socialPlatforms: profile.socialLinks.map((link) => link.platform),
      documents: documentProgress(profile.isSpecialist, profile.documents),
    });
    return { ...(await this.signPhoto(rest)), progress, bookingEnabled };
  }

  async updateOwnProfile(userId: string, dto: UpdateProfessionalProfileDto) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');

    const { specialtyIds, ...rest } = dto;
    // «Medicina General» no exige título de postgrado: solo cuenta como
    // especialista quien elige otra especialidad.
    const isSpecialist = specialtyIds
      ? (await this.prisma.specialty.count({
          where: { id: { in: specialtyIds }, slug: { not: GENERAL_MEDICINE_SLUG } },
        })) > 0
      : profile.isSpecialist;
    // Solo un cambio de identidad o de números de registro vuelve a revisión;
    // editar la biografía, el contacto o el resumen no despublica el perfil.
    const identityChanged = IDENTITY_FIELDS.some(
      (field) => dto[field] !== undefined && (dto[field] ?? '').trim() !== (profile[field] ?? '').trim(),
    );
    await this.geo.assertValidMunicipality(dto.municipality);

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
          searchName: searchNameFor(rest.firstName, rest.lastName),
          isSpecialist,
          // Un cambio de identidad en un perfil ya público o verificado espera
          // a que un administrador vuelva a revisar sus documentos.
          ...(identityChanged && (profile.isPublished || profile.verificationStatus === 'VERIFIED')
            ? { verificationStatus: 'IN_REVIEW' as const, isPublished: false }
            : {}),
        },
        include: { specialties: { include: { specialty: true } } },
      });
    });

    await this.syncRegistrations(profile.id, dto);
    if (!identityChanged) await this.recomputeStatusAndNotify(profile.id);
    await recomputeDirectoryScore(this.prisma, profile.id);
    return this.signPhoto(updated);
  }

  /** Aplica las reglas de publicación tras un cambio del médico y avisa si quedó público. */
  private async recomputeStatusAndNotify(professionalId: string) {
    const result = await recomputeProfessionalStatus(this.prisma, professionalId);
    if (!result?.becamePublic) return;
    const profile = await this.prisma.professionalProfile.findUniqueOrThrow({
      where: { id: professionalId },
      include: { user: { select: { email: true } } },
    });
    await notifyProfilePublished(
      this.notifications,
      { ...profile, email: profile.user.email },
      `${process.env.FRONTEND_URL}/medicos/${profile.slug}`,
      result.documents,
    );
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
    await this.recomputeStatusAndNotify(profile.id);
    await recomputeDirectoryScore(this.prisma, profile.id);
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

  /** Refleja mppsNumber / colmedMonagasNumber / inpremedicoNumber en ProfessionalRegistration. */
  private async syncRegistrations(professionalId: string, dto: UpdateProfessionalProfileDto) {
    for (const source of REGISTRATION_SOURCES) {
      const value = dto[source.field];
      if (value === undefined) continue;
      if (!value?.trim()) {
        await this.prisma.professionalRegistration.deleteMany({
          where: { professionalId, type: source.type, issuer: source.issuer },
        });
        continue;
      }
      await this.prisma.professionalRegistration.upsert({
        where: { professionalId_type_issuer: { professionalId, type: source.type, issuer: source.issuer } },
        create: { professionalId, type: source.type, issuer: source.issuer, jurisdiction: source.jurisdiction, number: value.trim() },
        // Un número cambiado vuelve a quedar sin verificar hasta la revisión.
        update: { number: value.trim(), verifiedAt: null },
      });
    }
  }

  // --- SEO: sitemap paginado y páginas especialidad + municipio ----------

  async sitemapEntries(page: number) {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const where: Prisma.ProfessionalProfileWhereInput = { isPublished: true, noIndex: false };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.professionalProfile.findMany({
        where,
        select: { slug: true, updatedAt: true },
        orderBy: { createdAt: 'asc' },
        skip: (safePage - 1) * SITEMAP_PAGE_SIZE,
        take: SITEMAP_PAGE_SIZE,
      }),
      this.prisma.professionalProfile.count({ where }),
    ]);
    return { items, total, page: safePage, pageSize: SITEMAP_PAGE_SIZE, totalPages: Math.ceil(total / SITEMAP_PAGE_SIZE) };
  }

  /**
   * Combinaciones especialidad + municipio con al menos un médico publicado:
   * solo esas generan página y entran al sitemap (sin páginas vacías).
   */
  async landingPages() {
    const rows = await this.prisma.professionalSpecialty.findMany({
      where: { professional: { isPublished: true, municipality: { not: null } } },
      select: { specialty: { select: { slug: true, name: true } }, professional: { select: { municipality: true } } },
    });
    const municipalities = await this.geo.listMunicipalities();
    const slugByName = new Map(municipalities.map((m) => [m.name, m.slug]));
    const counts = new Map<
      string,
      { specialtySlug: string; specialtyName: string; municipalitySlug: string; municipalityName: string; count: number }
    >();
    for (const row of rows) {
      const municipalityName = row.professional.municipality!;
      const municipalitySlug = slugByName.get(municipalityName);
      if (!municipalitySlug) continue;
      const key = `${row.specialty.slug}|${municipalitySlug}`;
      const entry = counts.get(key) ?? {
        specialtySlug: row.specialty.slug,
        specialtyName: row.specialty.name,
        municipalitySlug,
        municipalityName,
        count: 0,
      };
      entry.count += 1;
      counts.set(key, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
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
    if (
      suspended &&
      !profile.isPublished &&
      profile.verificationStatus !== 'VERIFIED' &&
      profile.verificationStatus !== 'SUSPENDED'
    ) {
      throw new ForbiddenException('Solo se pueden suspender perfiles publicados o verificados');
    }

    let updated = await this.prisma.professionalProfile.update({
      where: { id },
      data: suspended
        ? { verificationStatus: 'SUSPENDED', isPublished: false, rejectionReason: note }
        : { verificationStatus: 'IN_REVIEW', rejectionReason: null },
    });
    // Al reactivar, la verificación y la publicación salen de sus documentos
    // y de su perfil, igual que para cualquier otro médico.
    const status = suspended ? null : await recomputeProfessionalStatus(this.prisma, id);
    if (status) updated = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id } });
    const visible = !suspended && updated.isPublished;
    const profileUrl = `${process.env.FRONTEND_URL}/medicos/${profile.slug}`;

    await this.notifications.notify({
      userId: profile.userId,
      type: suspended ? 'PROFILE_SUSPENDED' : 'PROFILE_REINSTATED',
      title: suspended ? 'Tu perfil fue suspendido' : 'Tu perfil fue reactivado',
      content:
        note ??
        (suspended
          ? 'Tu perfil fue suspendido por el equipo de Guía Médica Monagas.'
          : visible
            ? 'Tu perfil fue reactivado y vuelve a estar visible.'
            : 'Tu perfil fue reactivado. Completa los requisitos de tu panel para volver al directorio.'),
      email: visible
        ? {
            to: profile.user.email,
            subject: 'Tu perfil fue reactivado — Guía Médica Monagas',
            html:
              updated.verificationStatus === 'VERIFIED' || !status
                ? profileVerifiedTemplate(profile.firstName, profileUrl)
                : profilePublishedTemplate(profile.firstName, profileUrl, status.documents.approved, status.documents.required),
            template: 'profile_reinstated',
          }
        : undefined,
    });

    return updated;
  }
}
