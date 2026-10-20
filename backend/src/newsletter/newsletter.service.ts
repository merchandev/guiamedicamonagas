import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  newsletterConfirmTemplate,
  newsletterEmail,
  renderNewsletterBlocks,
  type NewsletterBlock,
} from '../mail/mail.templates';
import type { CampaignContentDto } from './dto/newsletter.dto';

/** Pausa entre envíos para no saturar el SMTP (Hostinger). ~6-7 correos/seg. */
const SEND_DELAY_MS = 150;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

interface Recipient {
  email: string;
  subscriberId?: string;
  userId?: string;
  unsubscribeToken: string;
}

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private token(): string {
    return randomBytes(24).toString('base64url');
  }

  private normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  private frontendUrl(): string {
    return this.config.get('FRONTEND_URL', { infer: true });
  }

  private unsubscribeUrl(token: string): string {
    return `${this.frontendUrl()}/boletin/baja?token=${encodeURIComponent(token)}`;
  }

  private confirmUrl(token: string): string {
    return `${this.frontendUrl()}/boletin/confirmar?token=${encodeURIComponent(token)}`;
  }

  // --- Suscriptores ----------------------------------------------------------

  /** Alta/actualización manual desde el panel: queda ACTIVE de inmediato. */
  async addSubscriber(email: string, name?: string) {
    const normalized = this.normalize(email);
    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email: normalized } });
    if (existing) {
      return this.prisma.newsletterSubscriber.update({
        where: { email: normalized },
        data: {
          name: name ?? existing.name,
          // Reactiva una baja o un pendiente: es una acción explícita del admin.
          status: 'ACTIVE',
          source: existing.source === 'REGISTERED' ? 'ADMIN' : existing.source,
          unsubscribedAt: null,
          confirmToken: null,
          confirmedAt: existing.confirmedAt ?? new Date(),
        },
      });
    }
    return this.prisma.newsletterSubscriber.create({
      data: { email: normalized, name, status: 'ACTIVE', source: 'ADMIN', unsubscribeToken: this.token() },
    });
  }

  /** Importación masiva: pega una lista o CSV; extrae correos, deduplica y los crea ACTIVE. */
  async importSubscribers(text: string) {
    const found = text.match(EMAIL_RE) ?? [];
    const unique = [...new Set(found.map((e) => this.normalize(e)))];
    let added = 0;
    let updated = 0;
    for (const email of unique) {
      const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        await this.prisma.newsletterSubscriber.update({
          where: { email },
          data: { status: 'ACTIVE', unsubscribedAt: null, source: 'IMPORT' },
        });
        updated += 1;
      } else {
        await this.prisma.newsletterSubscriber.create({
          data: { email, status: 'ACTIVE', source: 'IMPORT', unsubscribeToken: this.token() },
        });
        added += 1;
      }
    }
    return { received: found.length, unique: unique.length, added, updated };
  }

  async listSubscribers(params: { status?: string; search?: string; page?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = 50;
    const where: Record<string, unknown> = {
      // La lista propia que administra el admin: nunca las filas sombra de usuarios.
      source: { in: ['ADMIN', 'IMPORT', 'PUBLIC'] },
    };
    if (params.status) where.status = params.status;
    if (params.search) where.email = { contains: this.normalize(params.search), mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, email: true, name: true, status: true, source: true, createdAt: true },
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async removeSubscriber(id: string) {
    await this.prisma.newsletterSubscriber.delete({ where: { id } }).catch(() => undefined);
    return { ok: true };
  }

  // --- Alta pública (doble opt-in), confirmación y baja ----------------------

  /** Siempre responde igual, exista o no el correo (no revela quién está suscrito). */
  async publicSubscribe(email: string, name?: string) {
    const normalized = this.normalize(email);
    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email: normalized } });
    if (existing?.status === 'ACTIVE') return { ok: true };

    const confirmToken = this.token();
    const subscriber = existing
      ? await this.prisma.newsletterSubscriber.update({
          where: { email: normalized },
          data: { status: 'PENDING', source: 'PUBLIC', name: name ?? existing.name, confirmToken, unsubscribedAt: null },
        })
      : await this.prisma.newsletterSubscriber.create({
          data: { email: normalized, name, status: 'PENDING', source: 'PUBLIC', confirmToken, unsubscribeToken: this.token() },
        });

    await this.mail.send({
      to: subscriber.email,
      subject: 'Confirma tu suscripción al boletín',
      html: newsletterConfirmTemplate(subscriber.name ?? undefined, this.confirmUrl(confirmToken)),
      template: 'newsletter-confirm',
    });
    return { ok: true };
  }

  async confirm(token: string) {
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({ where: { confirmToken: token } });
    if (!subscriber) throw new NotFoundException('Enlace de confirmación inválido o ya usado.');
    await this.prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { status: 'ACTIVE', confirmedAt: new Date(), confirmToken: null },
    });
    return { ok: true, email: subscriber.email };
  }

  async unsubscribe(token: string) {
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } });
    if (!subscriber) throw new NotFoundException('Enlace de baja inválido.');
    if (subscriber.status !== 'UNSUBSCRIBED') {
      await this.prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
      });
    }
    return { ok: true, email: subscriber.email };
  }

  // --- Audiencia -------------------------------------------------------------

  private async suppressionSet(): Promise<Set<string>> {
    const rows = await this.prisma.newsletterSubscriber.findMany({
      where: { status: 'UNSUBSCRIBED' },
      select: { email: true },
    });
    return new Set(rows.map((r) => r.email));
  }

  /** Correos únicos de la audiencia, sin crear filas ni tokens (para estimar/vista previa). */
  private async collectAudience(aud: {
    audienceList: boolean;
    audiencePatients: boolean;
    audienceProfessionals: boolean;
  }): Promise<Map<string, { userId?: string }>> {
    const suppressed = await this.suppressionSet();
    const map = new Map<string, { userId?: string }>();

    if (aud.audienceList) {
      const subs = await this.prisma.newsletterSubscriber.findMany({
        where: { status: 'ACTIVE', source: { in: ['ADMIN', 'IMPORT', 'PUBLIC'] } },
        select: { email: true },
      });
      for (const s of subs) if (!suppressed.has(s.email)) map.set(s.email, {});
    }

    const roles: string[] = [];
    if (aud.audiencePatients) roles.push('USER');
    if (aud.audienceProfessionals) roles.push('PROFESSIONAL');
    if (roles.length) {
      const users = await this.prisma.user.findMany({
        where: { role: { in: roles as never }, isEmailVerified: true, isActive: true, deletedAt: null },
        select: { id: true, email: true },
      });
      for (const u of users) {
        const email = this.normalize(u.email);
        if (suppressed.has(email)) continue;
        const current = map.get(email);
        if (current) current.userId = u.id;
        else map.set(email, { userId: u.id });
      }
    }
    return map;
  }

  async estimateAudience(aud: CampaignContentDto) {
    const map = await this.collectAudience(aud);
    return { total: map.size };
  }

  /** Igual que collectAudience, pero garantiza un token de baja por destinatario. */
  private async resolveRecipients(aud: {
    audienceList: boolean;
    audiencePatients: boolean;
    audienceProfessionals: boolean;
  }): Promise<Recipient[]> {
    const map = await this.collectAudience(aud);
    const emails = [...map.keys()];
    if (!emails.length) return [];

    const existing = await this.prisma.newsletterSubscriber.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, unsubscribeToken: true },
    });
    const byEmail = new Map(existing.map((s) => [s.email, s]));

    const recipients: Recipient[] = [];
    for (const email of emails) {
      let row = byEmail.get(email);
      if (!row) {
        // Usuario registrado sin fila propia: se crea una fila «sombra» solo para
        // tener un token de baja estable y honrar su cancelación en el futuro.
        row = await this.prisma.newsletterSubscriber.create({
          data: { email, status: 'ACTIVE', source: 'REGISTERED', unsubscribeToken: this.token() },
          select: { id: true, email: true, unsubscribeToken: true },
        });
      }
      recipients.push({ email, subscriberId: row.id, userId: map.get(email)?.userId, unsubscribeToken: row.unsubscribeToken });
    }
    return recipients;
  }

  // --- Campañas --------------------------------------------------------------

  private renderBody(dto: Pick<CampaignContentDto, 'contentMode' | 'blocks' | 'rawHtml'>): string {
    if (dto.contentMode === 'HTML') return dto.rawHtml ?? '';
    return renderNewsletterBlocks((dto.blocks ?? []) as NewsletterBlock[]);
  }

  private assertHasContent(dto: CampaignContentDto) {
    const body = this.renderBody(dto).trim();
    if (!dto.subject.trim()) throw new BadRequestException('Escribe el asunto del boletín.');
    if (!body) throw new BadRequestException('El boletín no tiene contenido.');
    if (!dto.audienceList && !dto.audiencePatients && !dto.audienceProfessionals)
      throw new BadRequestException('Elige al menos una audiencia.');
    return body;
  }

  listCampaigns() {
    return this.prisma.newsletterCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        status: true,
        audienceList: true,
        audiencePatients: true,
        audienceProfessionals: true,
        totalCount: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
        completedAt: true,
      },
    });
  }

  async getCampaign(id: string) {
    const campaign = await this.prisma.newsletterCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Boletín no encontrado.');
    const deliveries = await this.prisma.newsletterDelivery.findMany({
      where: { campaignId: id },
      orderBy: { sentAt: 'desc' },
      take: 1000,
      select: { id: true, email: true, status: true, error: true, sentAt: true },
    });
    return { campaign, deliveries };
  }

  /** Vista previa: el cuerpo dentro de la plantilla con la marca y un enlace de baja de ejemplo. */
  preview(dto: CampaignContentDto) {
    const body = this.renderBody(dto);
    return {
      html: newsletterEmail({ subject: dto.subject || 'Boletín', bodyHtml: body, unsubscribeUrl: this.unsubscribeUrl('ejemplo') }),
    };
  }

  async saveDraft(dto: CampaignContentDto, userId: string) {
    const renderedHtml = this.renderBody(dto);
    const data = {
      subject: dto.subject,
      contentMode: dto.contentMode,
      blocks: dto.contentMode === 'BLOCKS' ? ((dto.blocks ?? []) as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      rawHtml: dto.contentMode === 'HTML' ? (dto.rawHtml ?? '') : undefined,
      renderedHtml,
      audienceList: dto.audienceList,
      audiencePatients: dto.audiencePatients,
      audienceProfessionals: dto.audienceProfessionals,
    };
    if (dto.id) {
      const existing = await this.prisma.newsletterCampaign.findUnique({ where: { id: dto.id }, select: { status: true } });
      if (!existing) throw new NotFoundException('Boletín no encontrado.');
      if (existing.status !== 'DRAFT') throw new BadRequestException('Este boletín ya fue enviado; crea uno nuevo.');
      return this.prisma.newsletterCampaign.update({ where: { id: dto.id }, data });
    }
    return this.prisma.newsletterCampaign.create({ data: { ...data, createdBy: userId, status: 'DRAFT' } });
  }

  async sendTest(dto: CampaignContentDto, to: string) {
    const body = this.assertHasContent(dto);
    const html = newsletterEmail({
      subject: dto.subject,
      bodyHtml: body,
      unsubscribeUrl: this.unsubscribeUrl('prueba'),
    });
    const ok = await this.mail.send({ to, subject: `[PRUEBA] ${dto.subject}`, html, template: 'newsletter-test' });
    if (!ok) throw new BadRequestException('No se pudo enviar el correo de prueba.');
    return { ok: true };
  }

  /** Guarda (o actualiza) el borrador y lo envía a toda la audiencia en segundo plano. */
  async send(dto: CampaignContentDto, userId: string) {
    this.assertHasContent(dto);
    const campaign = await this.saveDraft(dto, userId);
    const recipients = await this.resolveRecipients(campaign);
    if (!recipients.length) throw new BadRequestException('La audiencia no tiene destinatarios.');

    await this.prisma.newsletterCampaign.update({
      where: { id: campaign.id },
      data: { status: 'SENDING', startedAt: new Date(), totalCount: recipients.length, sentCount: 0, failedCount: 0 },
    });

    // Disparo en segundo plano: el panel sigue el avance por el log de entregas.
    void this.deliver(campaign.id, campaign.subject, campaign.renderedHtml, recipients);
    return { ok: true, id: campaign.id, total: recipients.length };
  }

  private async deliver(campaignId: string, subject: string, body: string, recipients: Recipient[]) {
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const html = newsletterEmail({ subject, bodyHtml: body, unsubscribeUrl: this.unsubscribeUrl(r.unsubscribeToken) });
      const ok = await this.mail.send({ to: r.email, subject, html, template: 'newsletter', relatedUserId: r.userId });
      await this.prisma.newsletterDelivery.create({
        data: {
          campaignId,
          email: r.email,
          subscriberId: r.subscriberId,
          userId: r.userId,
          status: ok ? 'SENT' : 'FAILED',
          error: ok ? null : 'No se pudo entregar',
        },
      });
      ok ? (sent += 1) : (failed += 1);
      await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
    }
    const status = failed === 0 ? 'SENT' : sent === 0 ? 'FAILED' : 'PARTIAL';
    await this.prisma.newsletterCampaign
      .update({ where: { id: campaignId }, data: { status, sentCount: sent, failedCount: failed, completedAt: new Date() } })
      .catch((err) => this.logger.error(`No se pudo cerrar la campaña ${campaignId}: ${err.message}`));
  }

  /** Reintenta solo los destinatarios que fallaron en una campaña ya enviada. */
  async resendFailed(id: string) {
    const campaign = await this.prisma.newsletterCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Boletín no encontrado.');
    if (campaign.status === 'SENDING') throw new BadRequestException('El boletín todavía se está enviando.');

    const failedRows = await this.prisma.newsletterDelivery.findMany({
      where: { campaignId: id, status: 'FAILED' },
      select: { id: true, email: true },
    });
    if (!failedRows.length) throw new BadRequestException('No hay envíos fallidos que reintentar.');

    const emails = failedRows.map((r) => r.email);
    const suppressed = await this.suppressionSet();
    const subs = await this.prisma.newsletterSubscriber.findMany({
      where: { email: { in: emails } },
      select: { email: true, unsubscribeToken: true },
    });
    const tokenByEmail = new Map(subs.map((s) => [s.email, s.unsubscribeToken]));

    await this.prisma.newsletterCampaign.update({ where: { id }, data: { status: 'SENDING' } });
    void this.redeliverFailed(campaign.id, campaign.subject, campaign.renderedHtml, failedRows, tokenByEmail, suppressed);
    return { ok: true, retrying: failedRows.length };
  }

  private async redeliverFailed(
    campaignId: string,
    subject: string,
    body: string,
    failedRows: { id: string; email: string }[],
    tokenByEmail: Map<string, string>,
    suppressed: Set<string>,
  ) {
    let recovered = 0;
    for (const row of failedRows) {
      if (suppressed.has(row.email)) continue;
      const token = tokenByEmail.get(row.email) ?? 'baja';
      const html = newsletterEmail({ subject, bodyHtml: body, unsubscribeUrl: this.unsubscribeUrl(token) });
      const ok = await this.mail.send({ to: row.email, subject, html, template: 'newsletter' });
      if (ok) {
        await this.prisma.newsletterDelivery.update({ where: { id: row.id }, data: { status: 'SENT', error: null, sentAt: new Date() } });
        recovered += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
    }
    const campaign = await this.prisma.newsletterCampaign.findUnique({
      where: { id: campaignId },
      select: { totalCount: true },
    });
    const sentCount = await this.prisma.newsletterDelivery.count({ where: { campaignId, status: 'SENT' } });
    const failedCount = await this.prisma.newsletterDelivery.count({ where: { campaignId, status: 'FAILED' } });
    const status = failedCount === 0 ? 'SENT' : sentCount === 0 ? 'FAILED' : 'PARTIAL';
    await this.prisma.newsletterCampaign
      .update({ where: { id: campaignId }, data: { status, sentCount, failedCount } })
      .catch(() => undefined);
    this.logger.log(`Reintento de la campaña ${campaignId}: ${recovered} recuperados (total ${campaign?.totalCount ?? '?'}).`);
  }
}
