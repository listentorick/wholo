'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  recentError: boolean;
  fetchRecent: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  // `user` is the "authenticated and cleared for the admin app" signal — the
  // bearer for each poll comes from the centralised token provider in the
  // api-client, which refreshes it (and so recovers a suspended tab).
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<AdminNotification[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [recentError, setRecentError] = useState(false);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await adminNotificationsApi.unreadCount();
      setUnreadCount(res.count);
    } catch {
      // Non-critical — the badge just doesn't update if this fails.
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refreshUnreadCount]);

  const fetchRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    setRecentError(false);
    try {
      const list = await adminNotificationsApi.list();
      setRecent(list);
    } catch {
      setRecentError(true);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
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
      await adminNotificationsApi.markRead(id);
    } catch {
      // Optimistic update, no rollback on failure for v1 — accept rare
      // staleness; the next poll/dropdown-open reconciles it.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setRecent((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await adminNotificationsApi.markAllRead();
    } catch {
      // Same accepted-staleness trade-off as markRead.
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{ unreadCount, recent, isLoadingRecent, recentError, fetchRecent, markRead, markAllRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
