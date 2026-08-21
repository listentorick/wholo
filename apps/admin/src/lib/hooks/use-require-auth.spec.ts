import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRequireAuth } from './use-require-auth';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/delivery-runs',
}));

const login = vi.fn();
const authState: Record<string, unknown> = {};
vi.mock('../auth-context', () => ({
  useAuth: () => authState,
}));

function setAuth(overrides: Record<string, unknown>) {
  for (const key of Object.keys(authState)) delete authState[key];
  Object.assign(authState, { user: null, isLoading: false, onboardingRequired: false, login }, overrides);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useRequireAuth', () => {
  it('logs unauthenticated visitors in via Keycloak with the current path as the return destination', () => {
    setAuth({});
    renderHook(() => useRequireAuth());
    expect(login).toHaveBeenCalledWith('/delivery-runs');
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects authenticated-but-unonboarded visitors to /onboarding (no login loop)', () => {
    setAuth({ onboardingRequired: true });
    renderHook(() => useRequireAuth());
    expect(replace).toHaveBeenCalledWith('/onboarding');
  });

  it('redirects non-distributor visitors to /access-denied even though they have a Wholo user', () => {
    setAuth({ accessDenied: true });
    renderHook(() => useRequireAuth());
    expect(replace).toHaveBeenCalledWith('/access-denied');
  });

  it('prefers /access-denied over /onboarding when both are somehow set', () => {
    setAuth({ accessDenied: true, onboardingRequired: true });
    renderHook(() => useRequireAuth());
    expect(replace).toHaveBeenCalledWith('/access-denied');
  });

  it('does nothing while loading', () => {
    setAuth({ isLoading: true });
    renderHook(() => useRequireAuth());
    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing for an active user', () => {
    setAuth({ user: { id: 'u1' } });
    renderHook(() => useRequireAuth());
    expect(replace).not.toHaveBeenCalled();
  });
});
