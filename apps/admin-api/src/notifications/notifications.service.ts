import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly api: ApiClientService) {}

  list(userId: string, limit: string | undefined, token: string) {
    const qs = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    return this.api.get(`/users/${userId}/notifications${qs}`, token);
  }

  unreadCount(userId: string, token: string) {
    return this.api.get(`/users/${userId}/notifications/unread-count`, token);
  }

  markRead(userId: string, notificationId: string, token: string) {
    return this.api.post(`/users/${userId}/notifications/${notificationId}/read`, token);
  }

  markAllRead(userId: string, token: string) {
    return this.api.post(`/users/${userId}/notifications/read-all`, token);
  }
}
