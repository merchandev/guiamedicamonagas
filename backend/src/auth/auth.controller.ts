import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EnvConfig } from '../config/env.validation';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthService, LoginResult } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';

const REFRESH_COOKIE = 'gmm_refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date) {
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/api/v1/auth',
      expires: expiresAt,
    });
  }

  /** Solo entrega tokens si el login está completo; con MFA pendiente devuelve el desafío. */
  private respondToLogin(reply: FastifyReply, result: LoginResult) {
    if (result.kind === 'MFA_REQUIRED') {
      return { mfaRequired: true, challengeToken: result.challengeToken };
    }
    this.setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken };
  }

  private clearRefreshCookie(reply: FastifyReply) {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.auth.register(dto, req.ip);
    this.setRefreshCookie(reply, refreshToken, refreshTokenExpiresAt);
    return { accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.login(dto, req.ip, req.headers['user-agent']);
    return this.respondToLogin(reply, result);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  async verifyMfa(
    @Body() dto: VerifyMfaDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.verifyMfa(dto.challengeToken, dto.code, req.ip, req.headers['user-agent']);
    return this.respondToLogin(reply, result);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!cookieToken) {
      this.clearRefreshCookie(reply);
      return { accessToken: null };
    }
    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.auth.refresh(
      cookieToken,
      req.ip,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(reply, refreshToken, refreshTokenExpiresAt);
    return { accessToken };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(cookieToken);
    this.clearRefreshCookie(reply);
    return { message: 'Sesión cerrada' };
  }

  @Public()
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.auth.verifyEmail(token);
  }

  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('resend-verification')
  resendVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.resendVerification(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  /** Cambia la contraseña, cierra las demás sesiones y renueva la de este dispositivo. */
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.auth.changePassword(
      user.id,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(reply, refreshToken, refreshTokenExpiresAt);
    return { message: 'Contraseña actualizada; cerramos tus otras sesiones', accessToken };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.logoutAll(user.id, req.ip);
    this.clearRefreshCookie(reply);
    return result;
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('accept-legal')
  acceptLegal(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.auth.acceptLegal(user.id, req.ip);
  }
}
