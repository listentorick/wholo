'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { adminNotificationsApi } from '@wholo/admin-api-client';
import type { AdminNotification } from '@wholo/types';
import { useAuth } from './auth-context';

// No existing polling precedent in this codebase — kept deliberately simple:
// a plain setInterval, no backoff, no visibility-change pausing. A future
// refinement, not a first-cut requirement.
const POLL_INTERVAL_MS = 30_000;

interface NotificationContextValue {
  unreadCount: number;
  recent: AdminNotification[];
  isLoadingRecent: boolean;
  fetchRecent: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<AdminNotification[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  // Ref'd so the poll interval (set up once per accessToken change) always
  // calls with the latest token without needing to be its own effect dep.
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const refreshUnreadCount = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const res = await adminNotificationsApi.unreadCount(token);
      setUnreadCount(res.count);
    } catch {
      // Non-critical — the badge just doesn't update if this fails.
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [accessToken, refreshUnreadCount]);

  const fetchRecent = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    setIsLoadingRecent(true);
    try {
      const list = await adminNotificationsApi.list(token);
      setRecent(list);
    } catch {
      // Non-critical — the dropdown just stays empty/stale if this fails.
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    const token = tokenRef.current;
    if (!token) return;
    let wasUnread = false;
    setRecent((prev) =>
      prev.map((n) => {
        if (n.id === id && !n.readAt) {
          wasUnread = true;
          return { ...n, readAt: new Date().toISOString() };
        }
        return n;
      }),
    );
    if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await adminNotificationsApi.markRead(id, token);
    } catch {
      // Optimistic update, no rollback on failure for v1 — accept rare
      // staleness; the next poll/dropdown-open reconciles it.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    setRecent((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await adminNotificationsApi.markAllRead(token);
    } catch {
      // Same accepted-staleness trade-off as markRead.
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ unreadCount, recent, isLoadingRecent, fetchRecent, markRead, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
