import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Permission } from '@wholo/types';
import { useCan } from './permissions';

const auth: { user: { permissions: string[] } | null } = { user: null };
vi.mock('./auth-context', () => ({ useAuth: () => auth }));

describe('useCan', () => {
  it('says yes only to permissions the user was granted', () => {
    auth.user = { permissions: [Permission.TAX_TYPES_READ, Permission.ACCOUNTING_IMPORT] };
    const { result } = renderHook(() => useCan());

    expect(result.current(Permission.TAX_TYPES_READ)).toBe(true);
    expect(result.current(Permission.ACCOUNTING_IMPORT)).toBe(true);
    expect(result.current(Permission.TAX_TYPES_MANAGE)).toBe(false);
    expect(result.current(Permission.ACCOUNTING_MANAGE)).toBe(false);
  });

  it('says no to everything until the user has loaded, so nothing flashes and then vanishes', () => {
    auth.user = null;
    const { result } = renderHook(() => useCan());
    expect(result.current(Permission.TAX_TYPES_READ)).toBe(false);
  });

  it('treats a missing permission list as no permissions', () => {
    auth.user = {} as { permissions: string[] };
    const { result } = renderHook(() => useCan());
    expect(result.current(Permission.ORDERS_READ)).toBe(false);
  });
});
