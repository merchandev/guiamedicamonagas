import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureLocationCount(count: number) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { tier: 'ORGANIZATION' } });
    const max = plan?.maxLocations ?? 4;
    if (count > max) {
      throw new BadRequestException(`El plan de organizaciones permite hasta ${max} sedes`);
    }
  }

  findAll(type?: 'PHARMACY' | 'LABORATORY' | 'CLINIC', municipality?: string) {
    return this.prisma.organization.findMany({
      where: {
        isPublished: true,
        type,
        locations: municipality ? { some: { municipality } } : undefined,
      },
      include: { locations: true },
      orderBy: { name: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug }, include: { locations: true } });
    if (!org || !org.isPublished) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  async create(dto: UpsertOrganizationDto) {
    await this.ensureLocationCount(dto.locations.length);
    const slug = slugify(dto.name);
    const exists = await this.prisma.organization.findUnique({ where: { slug } });
    if (exists) throw new ConflictException('Ya existe una organización con ese nombre');
    return this.prisma.organization.create({
      data: {
        type: dto.type,
        name: dto.name,
        slug,
        description: dto.description,
        website: dto.website,
        logoUrl: dto.logoUrl,
        locations: { create: dto.locations },
      },
      include: { locations: true },
    });
  }

  async update(id: string, dto: UpsertOrganizationDto) {
    await this.ensureExists(id);
    await this.ensureLocationCount(dto.locations.length);
    return this.prisma.$transaction(async (tx) => {
      await tx.organizationLocation.deleteMany({ where: { organizationId: id } });
      return tx.organization.update({
        where: { id },
        data: {
          type: dto.type,
          name: dto.name,
          description: dto.description,
          website: dto.website,
          logoUrl: dto.logoUrl,
          locations: { create: dto.locations },
        },
        include: { locations: true },
      });
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.organization.delete({ where: { id } });
    return { message: 'Organización eliminada' };
  }

  async setPublished(id: string, isPublished: boolean) {
    await this.ensureExists(id);
    return this.prisma.organization.update({ where: { id }, data: { isPublished } });
  }

  private async ensureExists(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organización no encontrada');
  }
}
