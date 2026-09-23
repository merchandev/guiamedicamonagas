import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Permission, PERMISSIONS_KEY, roleHasPermissions } from '../permissions';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * @Roles(): el usuario debe tener uno de los roles listados.
 * @RequirePermissions(): su rol debe conceder todos los permisos listados.
 * Sin bypass para SUPERADMIN: si un endpoint es solo para PROFESSIONAL, un
 * SUPERADMIN tampoco entra (no actúa en nombre de un médico).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets);
    if (!requiredRoles?.length && !requiredPermissions?.length) {
      return true;
    }

    const user: AuthenticatedUser | undefined = context.switchToHttp().getRequest().user;
    const roleOk = !requiredRoles?.length || (!!user && requiredRoles.includes(user.role));
    const permissionsOk = !requiredPermissions?.length || (!!user && roleHasPermissions(user.role, requiredPermissions));
    if (!user || !roleOk || !permissionsOk) {
      throw new ForbiddenException('No tienes permisos para acceder a este recurso');
    }
    return true;
  }
}
