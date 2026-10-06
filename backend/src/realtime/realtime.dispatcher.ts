import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  type AudienceLookups,
  type CapturedEvent,
  deliveriesFor,
  emptyLookups,
  groupByRoom,
  lookupNeeds,
  sessionUsersFor,
} from './realtime-audience';
import { RealtimeServer } from './realtime.server';

const POLL_EVERY_MS = 500;
const BATCH = 500;

/**
 * Reparte la bandeja `RealtimeEvent` (la llenan disparadores de la base) por el
 * canal en tiempo real. Entrega al menos una vez: si la API se cae entre el
 * envío y la marca, el lote se vuelve a enviar y el cliente solo vuelve a pedir
 * los datos. No hay un cursor que se pueda saltar una transacción tardía: se
 * leen siempre los pendientes. Al reconectarse, cada cliente pide todo de nuevo.
 */
@Injectable()
export class RealtimeDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly server: RealtimeServer,
  ) {}

  onApplicationBootstrap() {
    if (!this.server.enabled) return;
    this.timer = setInterval(() => void this.tick(), POLL_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (let round = 0; round < 20; round++) {
        if ((await this.dispatchBatch()) < BATCH) break;
      }
    } catch (error) {
      this.logger.warn(`No se pudo repartir la bandeja de tiempo real: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Reparte hasta `BATCH` eventos pendientes; devuelve cuántos había. */
  async dispatchBatch(): Promise<number> {
    const events = await this.prisma.$queryRaw<CapturedEvent[]>`
      SELECT "id"::text AS "id", "source", "op", "rowId", "keys"
      FROM "RealtimeEvent"
      WHERE "dispatchedAt" IS NULL
      ORDER BY "id"
      LIMIT ${BATCH}`;
    if (!events.length) return 0;

    const lookups = await this.loadLookups(events);
    const deliveries = events.flatMap((event) => deliveriesFor(event, lookups));
    for (const [room, message] of groupByRoom(deliveries)) this.server.emit(room, message);
    const users = [...new Set(events.flatMap(sessionUsersFor))];
    if (users.length) await this.server.refreshUsers(users);

    const ids = events.map((event) => event.id);
    await this.prisma.$executeRaw`UPDATE "RealtimeEvent" SET "dispatchedAt" = now() WHERE "id" = ANY(${ids}::bigint[])`;
    return events.length;
  }

  private async loadLookups(events: CapturedEvent[]): Promise<AudienceLookups> {
    const needs = lookupNeeds(events);
    const lookups = emptyLookups();
    if (needs.reviewIds.size) {
      const reviews = await this.prisma.review.findMany({
        where: { id: { in: [...needs.reviewIds] } },
        select: { id: true, professionalId: true, patientId: true },
      });
      for (const review of reviews) {
        lookups.reviewOwner.set(review.id, { professionalId: review.professionalId, patientId: review.patientId });
        needs.patientIds.add(review.patientId);
      }
    }
    if (needs.installmentIds.size) {
      const installments = await this.prisma.subscriptionInstallment.findMany({
        where: { id: { in: [...needs.installmentIds] } },
        select: { id: true, subscriptionId: true },
      });
      for (const installment of installments) {
        lookups.installmentSubscription.set(installment.id, installment.subscriptionId);
        needs.subscriptionIds.add(installment.subscriptionId);
      }
    }
    const [patients, schedules, subscriptions] = await Promise.all([
      needs.patientIds.size
        ? this.prisma.patientProfile.findMany({ where: { id: { in: [...needs.patientIds] } }, select: { id: true, userId: true } })
        : [],
      needs.scheduleIds.size
        ? this.prisma.schedule.findMany({ where: { id: { in: [...needs.scheduleIds] } }, select: { id: true, professionalId: true } })
        : [],
      needs.subscriptionIds.size
        ? this.prisma.subscription.findMany({
            where: { id: { in: [...needs.subscriptionIds] } },
            select: { id: true, professionalId: true, organizationId: true },
          })
        : [],
    ]);
    for (const patient of patients) lookups.patientUser.set(patient.id, patient.userId);
    for (const schedule of schedules) lookups.scheduleOwner.set(schedule.id, schedule.professionalId);
    for (const subscription of subscriptions) {
      lookups.subscriptionOwner.set(subscription.id, {
        professionalId: subscription.professionalId,
        organizationId: subscription.organizationId,
      });
    }
    return lookups;
  }

  /** Sin replay incremental, un evento de más de un día ya no le sirve a nadie. */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeOldEvents() {
    try {
      const undelivered = await this.prisma.$executeRaw`
        DELETE FROM "RealtimeEvent" WHERE "createdAt" < now() - interval '1 day' AND "dispatchedAt" IS NULL`;
      await this.prisma.$executeRaw`DELETE FROM "RealtimeEvent" WHERE "createdAt" < now() - interval '1 day'`;
      // Con el canal apagado nadie los reparte: es lo esperado y no se avisa.
      if (undelivered && this.server.enabled) this.logger.warn(`${undelivered} evento(s) de tiempo real se borraron sin repartir`);
    } catch (error) {
      this.logger.warn(`No se pudo limpiar la bandeja de tiempo real: ${(error as Error).message}`);
    }
  }
}
