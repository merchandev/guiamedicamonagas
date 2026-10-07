import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EnvConfig } from '../config/env.validation';
import { Public } from '../common/decorators/public.decorator';
import { AcceptLegalDto } from '../legal/legal-request.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthService, LoginResult } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

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

  /**
   * La app móvil no usa cookies: recibe el refresh token en el cuerpo y lo
   * guarda en el almacén seguro del teléfono. Solo sin cabecera Origin: un
   * navegador la manda en todo POST, así que un script en la web no puede
   * pedir el token fuera de la cookie httpOnly.
   */
  private isMobileApp(req: FastifyRequest) {
    return req.headers['x-client'] === 'mobile-app' && !req.headers.origin;
  }

  /** Entrega una sesión: a la web en la cookie, a la app en el cuerpo. */
  private issue(
    reply: FastifyReply,
    tokens: { accessToken: string; refreshToken: string; refreshTokenExpiresAt: Date },
    mobile: boolean,
    extra: Record<string, unknown> = {},
  ) {
    if (mobile) {
      // Una cookie de una versión anterior de la app deja de usarse.
      this.clearRefreshCookie(reply);
      return {
        ...extra,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      };
    }
    this.setRefreshCookie(reply, tokens.refreshToken, tokens.refreshTokenExpiresAt);
    return { ...extra, accessToken: tokens.accessToken };
  }

  /** Solo entrega tokens si el login está completo; con MFA pendiente devuelve el desafío. */
  private respondToLogin(reply: FastifyReply, result: LoginResult, mobile: boolean) {
    if (result.kind === 'MFA_REQUIRED') {
      return { mfaRequired: true, challengeToken: result.challengeToken };
    }
    return this.issue(reply, result, mobile);
  }

  private clearRefreshCookie(reply: FastifyReply) {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  /** El refresh token de la petición: la app lo manda en el cuerpo; la web, en la cookie. */
  private refreshTokenOf(req: FastifyRequest, dto: RefreshTokenDto | undefined, mobile: boolean) {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    return mobile ? (dto?.refreshToken ?? cookieToken) : cookieToken;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const tokens = await this.auth.register(dto, req.ip, req.headers['user-agent']);
    return this.issue(reply, tokens, this.isMobileApp(req));
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
    return this.respondToLogin(reply, result, this.isMobileApp(req));
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
    return this.respondToLogin(reply, result, this.isMobileApp(req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const mobile = this.isMobileApp(req);
    const token = this.refreshTokenOf(req, dto, mobile);
    if (!token) {
      this.clearRefreshCookie(reply);
      return { accessToken: null };
    }
    const tokens = await this.auth.refresh(token, req.ip, req.headers['user-agent']);
    return this.issue(reply, tokens, mobile);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logout(this.refreshTokenOf(req, dto, this.isMobileApp(req)));
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
    const tokens = await this.auth.changePassword(user.id, dto, req.ip, req.headers['user-agent']);
    return this.issue(reply, tokens, this.isMobileApp(req), {
      message: 'Contraseña actualizada; cerramos tus otras sesiones',
    });
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
  acceptLegal(@CurrentUser() user: AuthenticatedUser, @Body() dto: AcceptLegalDto, @Req() req: FastifyRequest) {
    return this.auth.acceptLegal(user.id, dto.documents, req.ip, req.headers['user-agent']);
  }
}
