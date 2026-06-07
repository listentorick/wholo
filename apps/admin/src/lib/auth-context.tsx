'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { adminAuthApi, ApiError } from '@wholo/admin-api-client';
import type { AuthUser } from '@wholo/types';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_access_token') : null;
    if (!token) {
      setIsLoading(false);
      return;
    }
    setAccessToken(token);
    adminAuthApi
      .me(token)
      .then((u) => setUser(u))
      .catch(() => {
        localStorage.removeItem('admin_access_token');
        setAccessToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await adminAuthApi.login({ email, password });
    setAccessToken(result.accessToken);
    setUser(result.user);
    localStorage.setItem('admin_access_token', result.accessToken);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('admin_access_token');
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
