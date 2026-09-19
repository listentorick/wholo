'use client';

import { useCallback } from 'react';
import type { Permission } from '@wholo/types';
import { useAuth } from './auth-context';

/**
 * `can(permission)` for the signed-in user, from the permission list the
 * session returns. This is UX, not security: the API enforces every permission
 * on every request. The rule it serves — a control that can never be used by
 * this user is not shown at all (rather than shown and greyed out or failing).
 * Returns false until the user has loaded, so nothing flashes then vanishes.
 */
export function useCan(): (permission: Permission) => boolean {
  const { user } = useAuth();
  const granted = user?.permissions;
  return useCallback((permission: Permission) => !!granted?.includes(permission), [granted]);
}
