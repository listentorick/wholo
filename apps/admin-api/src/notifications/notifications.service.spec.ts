import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { ApiClientService } from '../api-client/api-client.service';

const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  postAnonymous: jest.fn(),
};

describe('NotificationsService (BFF)', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [NotificationsService, { provide: ApiClientService, useValue: mockApi }],
    }).compile();
    service = module.get(NotificationsService);
  });

  describe('list', () => {
    it('gets the explicit users/:userId/notifications route, with no query string when limit is omitted', async () => {
      await service.list('user-1', undefined, 'token-1');
      expect(mockApi.get).toHaveBeenCalledWith('/users/user-1/notifications', 'token-1');
    });

    it('appends the limit query param when provided', async () => {
      await service.list('user-1', '5', 'token-1');
      expect(mockApi.get).toHaveBeenCalledWith('/users/user-1/notifications?limit=5', 'token-1');
    });
  });

  describe('unreadCount', () => {
    it('gets the unread-count route for the explicit userId', async () => {
      await service.unreadCount('user-1', 'token-1');
      expect(mockApi.get).toHaveBeenCalledWith('/users/user-1/notifications/unread-count', 'token-1');
    });
  });

  describe('markRead', () => {
    it('posts to the notification-scoped read route for the explicit userId', async () => {
      await service.markRead('user-1', 'notif-1', 'token-1');
      expect(mockApi.post).toHaveBeenCalledWith('/users/user-1/notifications/notif-1/read', 'token-1');
    });
  });

  describe('markAllRead', () => {
    it('posts to the read-all route for the explicit userId', async () => {
      await service.markAllRead('user-1', 'token-1');
      expect(mockApi.post).toHaveBeenCalledWith('/users/user-1/notifications/read-all', 'token-1');
    });
  });
});
