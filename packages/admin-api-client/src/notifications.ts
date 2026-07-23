import type { AdminNotification, UnreadCountResponse } from '@wholo/types';
import { apiFetch } from './base';

export const adminNotificationsApi = {
  list(token: string, limit?: number): Promise<AdminNotification[]> {
    const qs = limit != null ? `?limit=${limit}` : '';
    return apiFetch<AdminNotification[]>(`/api/v1/notifications${qs}`, { token });
  },

  unreadCount(token: string): Promise<UnreadCountResponse> {
    return apiFetch<UnreadCountResponse>('/api/v1/notifications/unread-count', { token });
  },

  markRead(notificationId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/notifications/${notificationId}/read`, { method: 'POST', token });
  },

  markAllRead(token: string): Promise<void> {
    return apiFetch<void>('/api/v1/notifications/read-all', { method: 'POST', token });
  },
};
