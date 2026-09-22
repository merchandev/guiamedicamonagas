import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { tierAtLeast } from '../subscriptions/plan-tiers';
import { UpsertPostDto } from './dto/upsert-post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownProfileOrThrow(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    if (!tierAtLeast(profile.planTier, 'PROFESSIONAL_PLUS')) {
      throw new ForbiddenException('Las publicaciones requieren el plan Profesional Plus o superior');
    }
    return profile;
  }

  async listOwn(userId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    return this.prisma.post.findMany({ where: { professionalId: profile.id }, orderBy: { createdAt: 'desc' } });
  }

  async create(userId: string, dto: UpsertPostDto) {
    const profile = await this.ownProfileOrThrow(userId);
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { tier: profile.planTier } });

    if (plan?.postsLimit != null) {
      const count = await this.prisma.post.count({ where: { professionalId: profile.id } });
      if (count >= plan.postsLimit) {
        throw new BadRequestException(`Tu plan permite hasta ${plan.postsLimit} publicaciones`);
      }
    }

    const slug = `${slugify(dto.title)}-${Date.now().toString(36)}`;
    return this.prisma.post.create({
      data: { professionalId: profile.id, title: dto.title, content: dto.content, published: dto.published ?? false, slug },
    });
  }

  async update(userId: string, id: string, dto: UpsertPostDto) {
    const profile = await this.ownProfileOrThrow(userId);
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post || post.professionalId !== profile.id) throw new NotFoundException('Publicación no encontrada');
    return this.prisma.post.update({
      where: { id },
      data: { title: dto.title, content: dto.content, published: dto.published ?? post.published },
    });
  }

  async remove(userId: string, id: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post || post.professionalId !== profile.id) throw new NotFoundException('Publicación no encontrada');
    await this.prisma.post.delete({ where: { id } });
    return { message: 'Publicación eliminada' };
  }
}
