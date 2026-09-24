import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { EnvConfig } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';

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
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true, tokenVersion: true },
    });
    if (!user || !user.isActive || (payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Sesión inválida, inicia sesión de nuevo');
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}
