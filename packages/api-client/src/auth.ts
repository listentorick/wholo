import type { LoginRequest, LoginResponse, AuthUser } from '@wholo/types';
import { apiFetch } from './base';

export const authApi = {
  login(req: LoginRequest): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  me(token: string): Promise<AuthUser> {
    return apiFetch<AuthUser>('/api/v1/auth/me', { token });
  },
};
