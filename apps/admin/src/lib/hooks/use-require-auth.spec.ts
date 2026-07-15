import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRequireAuth } from './use-require-auth';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const authState: Record<string, unknown> = {};
vi.mock('../auth-context', () => ({
  useAuth: () => authState,
}));

function setAuth(overrides: Record<string, unknown>) {
  for (const key of Object.keys(authState)) delete authState[key];
  Object.assign(authState, { user: null, isLoading: false, onboardingRequired: false }, overrides);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useRequireAuth', () => {
  it('redirects unauthenticated visitors to /login', () => {
    setAuth({});
    renderHook(() => useRequireAuth());
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('redirects authenticated-but-unonboarded visitors to /onboarding (no login loop)', () => {
    setAuth({ onboardingRequired: true });
    renderHook(() => useRequireAuth());
    expect(replace).toHaveBeenCalledWith('/onboarding');
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
