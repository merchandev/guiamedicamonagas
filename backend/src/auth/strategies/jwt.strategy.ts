import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { EnvConfig } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { SESSION_USER_SELECT, sessionUserFrom } from '../session-user';

interface JwtPayload {
  sub: string;
  email: string;
  role: AuthenticatedUser['role'];
  /** Versión de sesión del usuario al emitir el token; ausente en tokens anteriores (= 0). */
  tv?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /**
   * SEC-02: la firma no basta. El token debe corresponder a la versión de
   * sesión vigente y a una cuenta activa, y el rol sale de la base de datos,
   * no del token: un cambio de rol o de contraseña rige desde la siguiente
   * petición, no cuando el access token expire.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const row = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: SESSION_USER_SELECT });
    const user = sessionUserFrom(row, payload.tv ?? 0);
    if (!user) throw new UnauthorizedException('Sesión inválida, inicia sesión de nuevo');
    return user;
  }
}
