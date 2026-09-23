import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  template: string;
  relatedUserId?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    this.from = this.config.get('MAIL_FROM', { infer: true });
    this.transporter = createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      auth: this.config.get('SMTP_USER', { infer: true })
        ? {
            user: this.config.get('SMTP_USER', { infer: true }),
            pass: this.config.get('SMTP_PASS', { infer: true }),
          }
        : undefined,
    });
  }

  /** Envío best-effort: nunca lanza, siempre queda auditado en MessageLog. */
  async send(options: SendMailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      });
      await this.log(options, 'SENT');
    } catch (error) {
      this.logger.error(`Fallo al enviar correo a ${options.to}: ${(error as Error).message}`);
      await this.log(options, 'FAILED', (error as Error).message);
    }
  }

  private async log(options: SendMailOptions, status: 'SENT' | 'FAILED', errorMessage?: string) {
    await this.prisma.messageLog
      .create({
        data: {
          channel: 'EMAIL',
          recipient: options.to,
          template: options.template,
          status,
          errorMessage,
          relatedUserId: options.relatedUserId,
        },
      })
      .catch((err) => this.logger.warn(`No se pudo registrar MessageLog: ${err.message}`));
  }
}
