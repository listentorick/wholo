import type { AdminNotification, UnreadCountResponse } from '@wholo/types';
import { apiFetch } from './base';

export const adminNotificationsApi = {
  list(options: { limit?: number; unread?: boolean } = {}): Promise<AdminNotification[]> {
    const params = new URLSearchParams();
    if (options.limit != null) params.set('limit', String(options.limit));
    if (options.unread) params.set('unread', 'true');
    const query = params.toString();
    const qs = query ? `?${query}` : '';
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
