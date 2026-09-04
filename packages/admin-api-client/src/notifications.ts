import type { AdminNotification, UnreadCountResponse } from '@wholo/types';
import { apiFetch } from './base';

export const adminNotificationsApi = {
  list(limit?: number): Promise<AdminNotification[]> {
    const qs = limit != null ? `?limit=${limit}` : '';
    return apiFetch<AdminNotification[]>(`/api/v1/notifications${qs}`);
  },

  unreadCount(): Promise<UnreadCountResponse> {
    return apiFetch<UnreadCountResponse>('/api/v1/notifications/unread-count');
  },

  markRead(notificationId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/notifications/${notificationId}/read`, { method: 'POST' });
  },

  markAllRead(): Promise<void> {
    return apiFetch<void>('/api/v1/notifications/read-all', { method: 'POST' });
  },
};
