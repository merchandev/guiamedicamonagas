import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AGENDA_MIN_TIER, tierAtLeast } from '../subscriptions/plan-tiers';
import { UpsertScheduleDto } from './dto/upsert-schedule.dto';
import { UpsertScheduleBlockDto } from './dto/upsert-schedule-block.dto';
import { UpsertScheduleExceptionDto } from './dto/upsert-schedule-exception.dto';

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownProfileOrThrow(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No tienes un perfil profesional');
    if (!tierAtLeast(profile.planTier, AGENDA_MIN_TIER)) {
      throw new ForbiddenException('La agenda requiere el plan Profesional o superior');
    }
    return profile;
  }

  /** Crea la fila de horario por defecto si el profesional aún no tiene una. */
  private async ensureSchedule(professionalId: string) {
    return this.prisma.schedule.upsert({
      where: { professionalId },
      update: {},
      create: { professionalId },
    });
  }

  async getOwnSchedule(userId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const schedule = await this.ensureSchedule(profile.id);
    const [blocks, exceptions] = await Promise.all([
      this.prisma.scheduleBlock.findMany({
        where: { scheduleId: schedule.id },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.scheduleException.findMany({ where: { scheduleId: schedule.id }, orderBy: { date: 'asc' } }),
    ]);
    return { ...schedule, blocks, exceptions };
  }

  async updateOwnSchedule(userId: string, dto: UpsertScheduleDto) {
    const profile = await this.ownProfileOrThrow(userId);
    await this.ensureSchedule(profile.id);
    return this.prisma.schedule.update({ where: { professionalId: profile.id }, data: dto });
  }

  async listOwnBlocks(userId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const schedule = await this.ensureSchedule(profile.id);
    return this.prisma.scheduleBlock.findMany({
      where: { scheduleId: schedule.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async addOwnBlock(userId: string, dto: UpsertScheduleBlockDto) {
    const profile = await this.ownProfileOrThrow(userId);
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('La hora de fin debe ser posterior a la hora de inicio');
    }
    const schedule = await this.ensureSchedule(profile.id);
    const existing = await this.prisma.scheduleBlock.findMany({
      where: { scheduleId: schedule.id, dayOfWeek: dto.dayOfWeek },
    });
    const overlaps = existing.some((b) => dto.startTime < b.endTime && dto.endTime > b.startTime);
    if (overlaps) {
      throw new BadRequestException('Ese horario se solapa con un bloque existente ese día');
    }
    return this.prisma.scheduleBlock.create({ data: { scheduleId: schedule.id, ...dto } });
  }

  async removeOwnBlock(userId: string, blockId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const block = await this.prisma.scheduleBlock.findUnique({
      where: { id: blockId },
      include: { schedule: true },
    });
    if (!block || block.schedule.professionalId !== profile.id) {
      throw new NotFoundException('Bloque no encontrado');
    }
    await this.prisma.scheduleBlock.delete({ where: { id: blockId } });
    return { message: 'Bloque eliminado' };
  }

  async listOwnExceptions(userId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const schedule = await this.ensureSchedule(profile.id);
    return this.prisma.scheduleException.findMany({ where: { scheduleId: schedule.id }, orderBy: { date: 'asc' } });
  }

  async addOwnException(userId: string, dto: UpsertScheduleExceptionDto) {
    const profile = await this.ownProfileOrThrow(userId);
    const schedule = await this.ensureSchedule(profile.id);
    return this.prisma.scheduleException.create({
      data: {
        scheduleId: schedule.id,
        date: new Date(dto.date),
        isBlocked: dto.isBlocked,
        startTime: dto.isBlocked ? undefined : dto.startTime,
        endTime: dto.isBlocked ? undefined : dto.endTime,
        reason: dto.reason,
      },
    });
  }

  async removeOwnException(userId: string, exceptionId: string) {
    const profile = await this.ownProfileOrThrow(userId);
    const exception = await this.prisma.scheduleException.findUnique({
      where: { id: exceptionId },
      include: { schedule: true },
    });
    if (!exception || exception.schedule.professionalId !== profile.id) {
      throw new NotFoundException('Excepción no encontrada');
    }
    await this.prisma.scheduleException.delete({ where: { id: exceptionId } });
    return { message: 'Excepción eliminada' };
  }

  /**
   * Usado por otros módulos (ej. Appointments) para calcular disponibilidad.
   * A diferencia de getOwnSchedule, NO crea una fila por defecto: si el
   * profesional nunca configuró su agenda, no hay disponibilidad que ofrecer.
   */
  async getScheduleForProfessional(professionalId: string) {
    const schedule = await this.prisma.schedule.findUnique({ where: { professionalId } });
    if (!schedule) return null;
    const [blocks, exceptions] = await Promise.all([
      this.prisma.scheduleBlock.findMany({ where: { scheduleId: schedule.id } }),
      this.prisma.scheduleException.findMany({ where: { scheduleId: schedule.id } }),
    ]);
    return { ...schedule, blocks, exceptions };
  }
}
