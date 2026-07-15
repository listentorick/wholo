import type { LoginRequest, LoginResponse, AuthUser, AuthSession } from '@wholo/types';
import { apiFetch } from './base';

export const adminAuthApi = {
  login(req: LoginRequest): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  me(token: string): Promise<AuthUser> {
    return apiFetch<AuthUser>('/api/v1/auth/me', { token });
  },

  /** Tri-state session check: ACTIVE (profile) or ONBOARDING_REQUIRED (identity only). */
  session(token: string): Promise<AuthSession> {
    return apiFetch<AuthSession>('/api/v1/auth/session', { token });
  },
};
