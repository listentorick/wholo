import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useQueryParamTab } from './use-query-param-tab';

const push = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/customers/c1',
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  vi.clearAllMocks();
  search = '';
});

describe('useQueryParamTab', () => {
  it('falls back to the default tab when no query param is present', () => {
    const { result } = renderHook(() => useQueryParamTab('overview'));
    expect(result.current.activeTab).toBe('overview');
  });

  it('reads the active tab from the ?tab= query param', () => {
    search = 'tab=account';
    const { result } = renderHook(() => useQueryParamTab<'overview' | 'account'>('overview'));
    expect(result.current.activeTab).toBe('account');
  });

  it('pushes the current pathname with the new tab param when setTab is called', () => {
    const { result } = renderHook(() => useQueryParamTab<'overview' | 'delivery'>('overview'));
    result.current.setTab('delivery');
    expect(push).toHaveBeenCalledWith('/customers/c1?tab=delivery');
  });
});
