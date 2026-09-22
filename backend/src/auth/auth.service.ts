import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  emailVerificationTemplate,
  passwordResetTemplate,
} from '../mail/mail.templates';
import { AuditService } from '../audit/audit.service';
import { slugify } from '../common/utils/slugify';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const BCRYPT_ROUNDS = 12;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly refreshExpirationDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {
    this.refreshExpirationDays = this.config.get('JWT_REFRESH_EXPIRATION_DAYS', { infer: true });
  }

  async register(dto: RegisterDto, ipAddress?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con este correo');
    }

    if (dto.role === 'PROFESSIONAL' && (!dto.firstName || !dto.lastName)) {
      throw new BadRequestException('Nombre y apellido son obligatorios para cuentas profesionales');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          role: dto.role,
        },
      });

      if (dto.role === 'PROFESSIONAL') {
        const base = slugify(`${dto.firstName} ${dto.lastName}`);
        const slug = `${base}-${created.id.slice(0, 6)}`;
        await tx.professionalProfile.create({
          data: {
            userId: created.id,
            slug,
            firstName: dto.firstName!.trim(),
            lastName: dto.lastName!.trim(),
          },
        });
      }

      return created;
    });

    await this.audit.record({
      userId: user.id,
      action: 'REGISTER',
      resource: 'User',
      resourceId: user.id,
      ipAddress,
    });

    await this.sendVerificationEmail(user.id, user.email, dto.firstName ?? user.email);

    return this.issueTokens(user.id, user.email, user.role, ipAddress);
  }

  private async sendVerificationEmail(userId: string, email: string, name: string) {
    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.verificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        type: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const verifyUrl = `${this.config.get('FRONTEND_URL', { infer: true })}/verificar-correo?token=${rawToken}`;
    await this.mail.send({
      to: email,
      subject: 'Confirma tu correo — Guía Médica Monagas',
      html: emailVerificationTemplate(name, verifyUrl),
      template: 'email_verification',
      relatedUserId: userId,
    });
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.isEmailVerified) {
      throw new BadRequestException('Este correo ya fue verificado');
    }
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    await this.sendVerificationEmail(user.id, user.email, profile?.firstName ?? user.email);
    return { message: 'Correo de verificación reenviado' };
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const token = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });
    if (!token || token.type !== 'EMAIL_VERIFICATION' || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('El enlace de verificación es inválido o expiró');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: token.userId }, data: { isEmailVerified: true } }),
      this.prisma.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    ]);
    return { message: 'Correo verificado correctamente' };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${minutesLeft} min.`,
      );
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
        },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'LOGIN',
      resource: 'User',
      resourceId: user.id,
      ipAddress,
    });

    return this.issueTokens(user.id, user.email, user.role, ipAddress, userAgent);
  }

  async issueTokens(
    userId: string,
    email: string,
    role: 'USER' | 'PROFESSIONAL' | 'ADMIN' | 'SUPERADMIN',
    ipAddress?: string,
    userAgent?: string,
  ) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email, role });

    const rawRefreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshExpirationDays * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawRefreshToken),
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken, refreshTokenExpiresAt: expiresAt };
  }

  async refresh(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date() || !existing.user.isActive) {
      throw new UnauthorizedException('Sesión inválida, inicia sesión de nuevo');
    }

    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.issueTokens(
      existing.user.id,
      existing.user.email,
      existing.user.role,
      ipAddress,
      userAgent,
    );

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenHash: hashToken(refreshToken) },
    });

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }

  async logout(rawRefreshToken?: string) {
    if (!rawRefreshToken) return;
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Respuesta idéntica exista o no la cuenta, para no filtrar qué correos están registrados.
    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      await this.prisma.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          type: 'PASSWORD_RESET',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const profile = await this.prisma.professionalProfile.findUnique({ where: { userId: user.id } });
      const resetUrl = `${this.config.get('FRONTEND_URL', { infer: true })}/restablecer-contrasena?token=${rawToken}`;
      await this.mail.send({
        to: user.email,
        subject: 'Restablece tu contraseña — Guía Médica Monagas',
        html: passwordResetTemplate(profile?.firstName ?? user.email, resetUrl),
        template: 'password_reset',
        relatedUserId: user.id,
      });
    }
    return { message: 'Si el correo existe, enviamos instrucciones para restablecer la contraseña' };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = hashToken(rawToken);
    const token = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });
    if (!token || token.type !== 'PASSWORD_RESET' || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('El enlace de restablecimiento es inválido o expiró');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Contraseña actualizada correctamente' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Contraseña actualizada correctamente' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        professionalProfile: {
          select: {
            id: true,
            slug: true,
            firstName: true,
            lastName: true,
            verificationStatus: true,
            isPublished: true,
          },
        },
      },
    });
    return user;
  }
}
