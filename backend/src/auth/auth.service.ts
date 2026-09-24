import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { emailVerificationTemplate, mfaCodeTemplate, passwordResetTemplate } from '../mail/mail.templates';
import { AuditService } from '../audit/audit.service';
import { slugify } from '../common/utils/slugify';
import { hashPassword, verifyPassword } from '../common/utils/password.util';
import { generatePatientCode } from '../patients/patient-code.util';
import { PatientDataCodec } from '../patients/patient-data.codec';
import { consumeInvitation } from '../organizations/organization-invitations';
import { PRIVACY_VERSION, TERMS_VERSION } from '../common/legal-versions';
import { ROLE_PERMISSIONS } from '../common/permissions';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const MFA_CODE_TTL_MS = 10 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;
const MFA_ROLES: Role[] = ['ADMIN', 'SUPERADMIN'];

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export type LoginResult = ({ kind: 'TOKENS' } & IssuedTokens) | { kind: 'MFA_REQUIRED'; challengeToken: string };

/** Lo necesario para emitir una sesión: la versión va dentro del access token. */
interface SessionUser {
  id: string;
  email: string;
  role: Role;
  tokenVersion: number;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
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
    private readonly patientCodec: PatientDataCodec,
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
    if (dto.role === 'USER' && (!dto.firstName || !dto.lastName || !dto.cedula)) {
      throw new BadRequestException('Nombre, apellido y cédula son obligatorios para registrarte como paciente');
    }
    if (dto.invitationToken && dto.role !== 'ORGANIZATION') {
      throw new BadRequestException('Las invitaciones de equipo se aceptan con una cuenta de organización');
    }
    if (dto.role === 'ORGANIZATION' && !dto.invitationToken && (!dto.organizationName || !dto.organizationType)) {
      throw new BadRequestException('Nombre y tipo de organización son obligatorios');
    }
    if (dto.role === 'USER') {
      const existingCedula = await this.prisma.patientProfile.findUnique({
        where: { cedulaLookup: this.patientCodec.cedulaLookup(dto.cedula!) },
      });
      if (existingCedula) {
        throw new ConflictException('Ya existe una cuenta registrada con esta cédula');
      }
    }

    const passwordHash = await hashPassword(dto.password);

    let user: Awaited<ReturnType<typeof this.prisma.user.create>>;
    let joinedOrganizationId: string | null = null;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: dto.email.toLowerCase(),
            passwordHash,
            role: dto.role,
            termsVersionAccepted: TERMS_VERSION,
            privacyVersionAccepted: PRIVACY_VERSION,
            legalAcceptedAt: new Date(),
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

        if (dto.role === 'USER') {
          const patientCode = await generatePatientCode(tx);
          await tx.patientProfile.create({
            data: {
              userId: created.id,
              patientCode,
              firstName: dto.firstName!.trim(),
              lastName: dto.lastName!.trim(),
              ...this.patientCodec.encodeCedula(dto.cedula!),
            },
          });
        }

        if (dto.role === 'ORGANIZATION' && dto.invitationToken) {
          // Alta por invitación: se une al equipo existente, sin crear otra
          // organización. Un token inválido o de otro correo deshace el alta.
          const joined = await consumeInvitation(tx, dto.invitationToken, created);
          joinedOrganizationId = joined.organizationId;
        } else if (dto.role === 'ORGANIZATION') {
          // Nace sin publicar y pendiente: un administrador la verifica antes
          // de que aparezca en el directorio (igual que los médicos).
          await tx.organization.create({
            data: {
              type: dto.organizationType!,
              name: dto.organizationName!.trim(),
              slug: `${slugify(dto.organizationName!)}-${created.id.slice(0, 6)}`,
              rif: dto.organizationRif?.toUpperCase(),
              isPublished: false,
              verificationStatus: 'PENDING',
              members: { create: { userId: created.id, role: 'OWNER' } },
            },
          });
        }

        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una cuenta con estos datos');
      }
      throw error;
    }

    await this.audit.record({
      userId: user.id,
      action: 'REGISTER',
      resource: 'User',
      resourceId: user.id,
      details: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        ...(joinedOrganizationId ? { joinedOrganizationId } : {}),
      },
      ipAddress,
    });
    if (joinedOrganizationId) {
      await this.audit.record({
        userId: user.id,
        action: 'ORGANIZATION_INVITATION_ACCEPTED',
        resource: 'Organization',
        resourceId: joinedOrganizationId,
        details: { viaRegistration: true },
        ipAddress,
      });
    }

    await this.sendVerificationEmail(user.id, user.email, dto.firstName ?? dto.organizationName ?? user.email);

    return this.issueTokens(user, ipAddress);
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
    const tokenHash = hashToken(rawToken ?? '');
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

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<LoginResult> {
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

    const verification = await verifyPassword(dto.password, user.passwordHash);
    if (!verification.valid) {
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

    // Migración silenciosa bcrypt → Argon2id: el usuario no nota nada
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(verification.needsRehash && { passwordHash: verification.newHash }),
      },
    });

    if (this.config.get('ADMIN_MFA_ENABLED', { infer: true }) && MFA_ROLES.includes(user.role)) {
      return { kind: 'MFA_REQUIRED', challengeToken: await this.startMfaChallenge(user.id, user.email) };
    }

    return this.completeLogin(user, ipAddress, userAgent);
  }

  private async completeLogin(
    user: SessionUser,
    ipAddress?: string,
    userAgent?: string,
    mfa = false,
  ): Promise<LoginResult> {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ipAddress } });
    await this.audit.record({
      userId: user.id,
      action: 'LOGIN',
      resource: 'User',
      resourceId: user.id,
      details: mfa ? { mfa: 'EMAIL_CODE' } : undefined,
      ipAddress,
    });
    return { kind: 'TOKENS', ...(await this.issueTokens(user, ipAddress, userAgent)) };
  }

  /**
   * Segundo factor para ADMIN/SUPERADMIN: código de 6 dígitos por correo,
   * válido 10 minutos y con máximo de intentos. El cliente recibe un token de
   * desafío opaco (no un JWT): sin el código no obtiene ninguna sesión.
   */
  private async startMfaChallenge(userId: string, email: string): Promise<string> {
    const challengeToken = randomBytes(32).toString('hex');
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.verificationToken.updateMany({
        where: { userId, type: 'MFA_LOGIN', usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.verificationToken.create({
        data: {
          userId,
          type: 'MFA_LOGIN',
          tokenHash: hashToken(challengeToken),
          codeHash: hashToken(`${challengeToken}:${code}`),
          expiresAt: new Date(Date.now() + MFA_CODE_TTL_MS),
        },
      }),
    ]);
    await this.mail.send({
      to: email,
      subject: 'Tu código de acceso — Guía Médica Monagas',
      html: mfaCodeTemplate(code),
      template: 'mfa_code',
      relatedUserId: userId,
    });
    return challengeToken;
  }

  async verifyMfa(challengeToken: string, code: string, ipAddress?: string, userAgent?: string): Promise<LoginResult> {
    const token = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(challengeToken) },
      include: { user: true },
    });
    if (!token || token.type !== 'MFA_LOGIN' || token.usedAt || token.expiresAt < new Date() || !token.user.isActive) {
      throw new UnauthorizedException('El código expiró; inicia sesión de nuevo');
    }
    if (token.attempts >= MFA_MAX_ATTEMPTS) {
      await this.prisma.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
      throw new UnauthorizedException('Demasiados intentos; inicia sesión de nuevo');
    }
    if (!token.codeHash || !safeEqualHex(token.codeHash, hashToken(`${challengeToken}:${code}`))) {
      await this.prisma.verificationToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Código incorrecto');
    }
    await this.prisma.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    return this.completeLogin(token.user, ipAddress, userAgent, true);
  }

  async issueTokens(user: SessionUser, ipAddress?: string, userAgent?: string): Promise<IssuedTokens> {
    const userId = user.id;
    const accessToken = await this.jwt.signAsync({ sub: userId, email: user.email, role: user.role, tv: user.tokenVersion });

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

    // Detección de reutilización: un refresh token ya rotado que vuelve a
    // presentarse indica que fue robado (o copiado). Se revocan TODAS las
    // sesiones del usuario para cortar al atacante.
    // Margen de 30 s: dos pestañas refrescando a la vez presentan el mismo
    // token legítimamente; eso no es un robo.
    const reuseGraceMs = 30_000;
    if (existing?.revokedAt && existing.replacedByTokenHash && Date.now() - existing.revokedAt.getTime() > reuseGraceMs) {
      await this.prisma.$transaction(this.revokeAllSessionsOps(existing.userId));
      await this.audit.record({
        userId: existing.userId,
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        resource: 'RefreshToken',
        resourceId: existing.id,
        ipAddress,
      });
      throw new UnauthorizedException('Sesión inválida, inicia sesión de nuevo');
    }

    if (!existing || existing.revokedAt || existing.expiresAt < new Date() || !existing.user.isActive) {
      throw new UnauthorizedException('Sesión inválida, inicia sesión de nuevo');
    }

    const tokens = await this.issueTokens(existing.user, ipAddress, userAgent);

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenHash: hashToken(tokens.refreshToken) },
    });

    return tokens;
  }

  /**
   * Revoca todos los refresh tokens y sube la versión de sesión: los access
   * tokens ya emitidos dejan de valer en la siguiente petición.
   */
  private revokeAllSessionsOps(userId: string) {
    const revokeRefresh = this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const bumpVersion = this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    return [revokeRefresh, bumpVersion] as [typeof revokeRefresh, typeof bumpVersion];
  }

  /** "Cerrar sesión en todos los dispositivos", incluido este. */
  async logoutAll(userId: string, ipAddress?: string) {
    await this.prisma.$transaction(this.revokeAllSessionsOps(userId));
    await this.audit.record({ userId, action: 'LOGOUT_ALL_SESSIONS', resource: 'User', resourceId: userId, ipAddress });
    return { message: 'Cerraste sesión en todos tus dispositivos' };
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

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
      ...this.revokeAllSessionsOps(token.userId),
    ]);
    await this.audit.record({ userId: token.userId, action: 'PASSWORD_RESET', resource: 'User', resourceId: token.userId });

    return { message: 'Contraseña actualizada correctamente' };
  }

  /**
   * Cierra todas las demás sesiones (refresh y access tokens) y devuelve una
   * sesión nueva para este dispositivo, que así sigue conectado.
   */
  async changePassword(userId: string, dto: ChangePasswordDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const verification = await verifyPassword(dto.currentPassword, user.passwordHash);
    if (!verification.valid) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    }
    const passwordHash = await hashPassword(dto.newPassword);
    const [, , updated] = await this.prisma.$transaction([
      ...this.revokeAllSessionsOps(userId),
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    ]);
    await this.audit.record({ userId, action: 'PASSWORD_CHANGED', resource: 'User', resourceId: userId, ipAddress });
    return this.issueTokens(updated, ipAddress, userAgent);
  }

  /** Registra que el usuario aceptó las versiones vigentes de los textos legales. */
  async acceptLegal(userId: string, ipAddress?: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { termsVersionAccepted: TERMS_VERSION, privacyVersionAccepted: PRIVACY_VERSION, legalAcceptedAt: new Date() },
    });
    await this.audit.record({
      userId,
      action: 'LEGAL_ACCEPTED',
      resource: 'User',
      resourceId: userId,
      details: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
      ipAddress,
    });
    return this.me(userId);
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
        termsVersionAccepted: true,
        privacyVersionAccepted: true,
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
        organizationMemberships: {
          select: {
            role: true,
            organization: { select: { id: true, slug: true, name: true, type: true, verificationStatus: true } },
          },
        },
      },
    });
    return {
      ...user,
      permissions: ROLE_PERMISSIONS[user.role],
      legal: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
      needsLegalAcceptance:
        user.termsVersionAccepted !== TERMS_VERSION || user.privacyVersionAccepted !== PRIVACY_VERSION,
    };
  }
}
