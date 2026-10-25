import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@wholo/types';
import { PERMISSIONS_KEY } from '../permissions.decorator';
import { RequestUser, hasPlatformPermissions } from '../ops-session';

/**
 * Gate for platform-level routes (ADR-078): the caller must be in an ops
 * session (Ops client + authenticator) AND hold the route's @RequirePermissions
 * on their membership of the Stocdup PLATFORM organisation. Used in place of
 * DistributorAccessGuard/PermissionsGuard — a platform route never acts inside
 * a distributor's scope, even when its path names one. Fails closed: a route
 * with no @RequirePermissions is refused.
 */
@Injectable()
export class PlatformAccessGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest().user as RequestUser | undefined;
    if (!required || required.length === 0 || !hasPlatformPermissions(user, required)) {
      throw new ForbiddenException('Platform access requires the Ops app and a platform admin role');
    }
    return true;
  }
}
