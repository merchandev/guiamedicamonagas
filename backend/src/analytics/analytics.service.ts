import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackEventDto } from './dto/track-event.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(dto: TrackEventDto, ipAddress?: string, userAgent?: string) {
    await this.prisma.analyticsEvent.create({
      data: { eventType: dto.eventType, resourceId: dto.resourceId, ipAddress, userAgent },
    });
    return { ok: true };
  }

  async statsForOwnProfile(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');

    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['eventType'],
      where: { resourceId: profile.id },
      _count: { _all: true },
    });

    return Object.fromEntries(grouped.map((g) => [g.eventType, g._count._all]));
  }
}
