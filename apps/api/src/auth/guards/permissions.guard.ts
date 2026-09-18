import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Permission } from '@wholo/types';
import { PERMISSIONS_KEY } from '../permissions.decorator';
import { ROLE_PERMISSIONS } from '../role-permissions';

interface MembershipClaim {
  organisationId: string;
  roles: Role[];
}
interface RequestUser {
  organisationId?: string;
  memberships?: MembershipClaim[];
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    // Resolve the ONE membership in scope for this request the same way
    // DistributorAccessGuard resolves tenant scope (the :distributorId path
    // param), never unioning permissions across a user's OTHER memberships.
    // Note: this always evaluates the caller's own membership, even under an
    // order-as impersonation session — OrderAsInterceptor's context is
    // stored separately from request.user, and guards run before an
    // interceptor's handler-side logic, so there is no ordering hazard here.
    const scopeOrgId: string | undefined = request.params?.distributorId ?? user?.organisationId;
    const membership = user?.memberships?.find((m) => m.organisationId === scopeOrgId);

    const effectivePermissions = new Set<Permission>(
      (membership?.roles ?? []).flatMap((role) => ROLE_PERMISSIONS[role] ?? []),
    );

    const hasAll = required.every((permission) => effectivePermissions.has(permission));
    if (!hasAll) throw new ForbiddenException('Missing required permission');
    return true;
  }
}
