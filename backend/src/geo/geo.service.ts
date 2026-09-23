import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  listStates(onlyActive = true) {
    return this.prisma.state.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      select: { id: true, slug: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Municipios de los estados activos (o de uno en particular), con su estado. */
  listMunicipalities(stateSlug?: string) {
    return this.prisma.municipality.findMany({
      where: { state: stateSlug ? { slug: stateSlug } : { isActive: true } },
      select: { id: true, slug: true, name: true, state: { select: { slug: true, name: true } } },
      orderBy: [{ state: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  listParishes(municipalityId: string) {
    return this.prisma.parish.findMany({
      where: { municipalityId },
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findMunicipalityBySlug(slug: string) {
    return this.prisma.municipality.findFirst({
      where: { slug, state: { isActive: true } },
      select: { id: true, slug: true, name: true, state: { select: { slug: true, name: true } } },
    });
  }

  /**
   * Los perfiles guardan el nombre del municipio (compatibilidad con los
   * datos existentes); aquí se exige que exista en el catálogo de un estado
   * activo, en vez de aceptar cualquier texto.
   */
  async assertValidMunicipality(name: string | null | undefined) {
    if (!name) return;
    const found = await this.prisma.municipality.findFirst({
      where: { name, state: { isActive: true } },
      select: { id: true },
    });
    if (!found) throw new BadRequestException(`Municipio no reconocido: ${name}`);
  }

  async setStateActive(slug: string, isActive: boolean) {
    const state = await this.prisma.state.findUnique({ where: { slug } });
    if (!state) throw new NotFoundException('Estado no encontrado');
    return this.prisma.state.update({ where: { slug }, data: { isActive } });
  }

  async addMunicipality(stateSlug: string, name: string) {
    const state = await this.prisma.state.findUnique({ where: { slug: stateSlug } });
    if (!state) throw new NotFoundException('Estado no encontrado');
    try {
      return await this.prisma.municipality.create({ data: { stateId: state.id, name: name.trim(), slug: slugify(name) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ese municipio ya existe en el estado');
      }
      throw error;
    }
  }

  async addParish(municipalityId: string, name: string) {
    const municipality = await this.prisma.municipality.findUnique({ where: { id: municipalityId } });
    if (!municipality) throw new NotFoundException('Municipio no encontrado');
    try {
      return await this.prisma.parish.create({ data: { municipalityId, name: name.trim(), slug: slugify(name) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esa parroquia ya existe en el municipio');
      }
      throw error;
    }
  }
}
