import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { UpsertSpecialtyDto } from './dto/upsert-specialty.dto';

@Injectable()
export class SpecialtiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.specialty.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { professionals: true } } },
    });
  }

  async findBySlug(slug: string) {
    const specialty = await this.prisma.specialty.findUnique({ where: { slug } });
    if (!specialty) throw new NotFoundException('Especialidad no encontrada');
    return specialty;
  }

  async create(dto: UpsertSpecialtyDto) {
    const slug = slugify(dto.name);
    const exists = await this.prisma.specialty.findFirst({ where: { OR: [{ slug }, { name: dto.name }] } });
    if (exists) throw new ConflictException('Ya existe una especialidad con ese nombre');
    return this.prisma.specialty.create({ data: { ...dto, slug } });
  }

  async update(id: string, dto: UpsertSpecialtyDto) {
    await this.ensureExists(id);
    const slug = slugify(dto.name);
    return this.prisma.specialty.update({ where: { id }, data: { ...dto, slug } });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.specialty.delete({ where: { id } });
    return { message: 'Especialidad eliminada' };
  }

  private async ensureExists(id: string) {
    const specialty = await this.prisma.specialty.findUnique({ where: { id } });
    if (!specialty) throw new NotFoundException('Especialidad no encontrada');
  }
}
