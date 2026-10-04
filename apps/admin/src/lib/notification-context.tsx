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
      // Unread only: the dropdown is an inbox, not a history — reading an
      // item removes it.
      const list = await adminNotificationsApi.list({ unread: true });
      setRecent(list);
    } catch {
      setRecentError(true);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    // Only listed (so unread — fetchRecent asks for unread only) items are
    // clickable, so this is optimistically one fewer unread. The server count
    // is re-fetched once the read lands, correcting any drift.
    setRecent((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await adminNotificationsApi.markRead(id);
    } catch {
      // No rollback for v1 — the re-fetch below / next poll reconciles it.
    }
    await refreshUnreadCount();
  }, [refreshUnreadCount]);

  const markAllRead = useCallback(async () => {
    setRecent([]);
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
