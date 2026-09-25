import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Permission, RequirePermissions } from '../common/permissions';
import type { EnvConfig } from '../config/env.validation';
import { PATIENT_VAULT_COOKIE, PATIENT_VAULT_COOKIE_PATH, PatientVaultService } from './patient-vault.service';

class UnlockPatientVaultDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  code!: string;
}

const vaultToken = (req: FastifyRequest) => (req.cookies as Record<string, string> | undefined)?.[PATIENT_VAULT_COOKIE];

@RequirePermissions(Permission.VERIFY_PATIENT_IDENTITY)
@Controller('patients/admin/vault')
export class PatientVaultController {
  constructor(
    private readonly vault: PatientVaultService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Get()
  async status(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    const session = await this.vault.activeSession(user.id, vaultToken(req));
    return { configured: this.vault.configured, unlocked: !!session, expiresAt: session?.expiresAt ?? null };
  }

  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('unlock')
  @HttpCode(200)
  async unlock(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UnlockPatientVaultDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { token, expiresAt } = await this.vault.unlock(user.id, dto.code, req.ip);
    reply.setCookie(PATIENT_VAULT_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'strict',
      path: PATIENT_VAULT_COOKIE_PATH,
      expires: expiresAt,
    });
    return { configured: true, unlocked: true, expiresAt };
  }

  @Post('lock')
  @HttpCode(200)
  async lock(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.vault.lock(user.id, vaultToken(req), req.ip);
    reply.clearCookie(PATIENT_VAULT_COOKIE, { path: PATIENT_VAULT_COOKIE_PATH });
    return { configured: this.vault.configured, unlocked: false, expiresAt: null };
  }
}
