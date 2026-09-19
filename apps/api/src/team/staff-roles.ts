import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ASSIGNABLE_STAFF_ROLES } from '@wholo/types';

/** Roles that mark a person as the Owner (or above) — never editable via Team. */
export const OWNER_ROLES: readonly Role[] = [Role.DISTRIBUTOR_ADMIN, Role.PLATFORM_ADMIN];

const ASSIGNABLE = new Set<string>(ASSIGNABLE_STAFF_ROLES);

/**
 * Validates a requested role set for an invitation or a role edit: at least
 * one role, every role assignable by an Owner (never DISTRIBUTOR_ADMIN, and
 * not DRIVER until driver onboarding exists). Returns the de-duplicated set.
 */
export function assertAssignableRoles(roles: Role[]): Role[] {
  const unique = [...new Set(roles)];
  if (unique.length === 0) {
    throw new BadRequestException('Choose at least one role.');
  }
  const rejected = unique.filter((r) => !ASSIGNABLE.has(r));
  if (rejected.length > 0) {
    throw new BadRequestException(`These roles can't be assigned to team members: ${rejected.join(', ')}.`);
  }
  return unique;
}
