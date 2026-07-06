import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useRequireAuth } from './use-require-auth';
import { useAuth } from '../auth-context';

vi.mock('../auth-context');

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function makeAuth(overrides: Partial<ReturnType<typeof useAuth>>) {
  return {
    user: null,
    accessToken: null,
    isLoading: false,
    orderAsMode: false,
    orderAsCustomerName: null,
    login: vi.fn(),
    loginWithRedirect: vi.fn(),
    registerWithRedirect: vi.fn(),
    logout: vi.fn(),
    setOrderAsSession: vi.fn(),
    clearOrderAsSession: vi.fn(),
    ...overrides,
  };
}

describe('useRequireAuth', () => {
  it('does nothing while isLoading is true', () => {
    const login = vi.fn();
    mockUseAuth.mockReturnValue(makeAuth({ isLoading: true, login }));
    renderHook(() => useRequireAuth('/winos'));
    expect(login).not.toHaveBeenCalled();
  });

  it('calls login with the provided returnUrl when unauthenticated', () => {
    const login = vi.fn();
    mockUseAuth.mockReturnValue(makeAuth({ isLoading: false, user: null, login }));
    renderHook(() => useRequireAuth('/winos'));
    expect(login).toHaveBeenCalledWith('/winos');
  });

  it('calls login with undefined when no returnUrl is provided', () => {
    const login = vi.fn();
    mockUseAuth.mockReturnValue(makeAuth({ isLoading: false, user: null, login }));
    renderHook(() => useRequireAuth());
    expect(login).toHaveBeenCalledWith(undefined);
  });

  it('does not call login when user is authenticated', () => {
    const login = vi.fn();
    const user = { id: 'u1', email: 'a@b.com' } as any;
    mockUseAuth.mockReturnValue(makeAuth({ isLoading: false, user, login }));
    renderHook(() => useRequireAuth('/winos'));
    expect(login).not.toHaveBeenCalled();
  });
});
