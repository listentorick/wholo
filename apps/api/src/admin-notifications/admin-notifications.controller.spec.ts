import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserAccessGuard } from '../auth/guards/user-access.guard';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsService } from './admin-notifications.service';

const mockService = {
  list: jest.fn(),
  unreadCount: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
};

describe('AdminNotificationsController', () => {
  let controller: AdminNotificationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminNotificationsController],
      providers: [{ provide: AdminNotificationsService, useValue: mockService }],
    }).compile();
    controller = module.get(AdminNotificationsController);
  });

  it('is protected by the JWT and user-access guards', () => {
    const guards = Reflect.getMetadata('__guards__', AdminNotificationsController);
    expect(guards).toEqual([JwtAuthGuard, UserAccessGuard]);
  });

  it('list resolves organisationId from the authenticated principal, never a client param', async () => {
    mockService.list.mockResolvedValue([{ id: 'n1' }]);

    await controller.list('user-1', '10', { user: { organisationId: 'org-1' } } as any);

    expect(mockService.list).toHaveBeenCalledWith('user-1', 'org-1', 10);
  });

  it('unreadCount passes userId and organisationId through', async () => {
    mockService.unreadCount.mockResolvedValue(2);

    const result = await controller.unreadCount('user-1', { user: { organisationId: 'org-1' } } as any);

    expect(mockService.unreadCount).toHaveBeenCalledWith('user-1', 'org-1');
    expect(result).toEqual({ count: 2 });
  });

  it('markRead passes userId, organisationId and notificationId through', async () => {
    await controller.markRead('user-1', 'n1', { user: { organisationId: 'org-1' } } as any);

    expect(mockService.markRead).toHaveBeenCalledWith('user-1', 'org-1', 'n1');
  });

  it('markAllRead passes userId and organisationId through', async () => {
    await controller.markAllRead('user-1', { user: { organisationId: 'org-1' } } as any);

    expect(mockService.markAllRead).toHaveBeenCalledWith('user-1', 'org-1');
  });

  it('throws ForbiddenException when the credential carries no organisationId', async () => {
    await expect(controller.unreadCount('user-1', { user: {} } as any)).rejects.toThrow(ForbiddenException);
    expect(mockService.unreadCount).not.toHaveBeenCalled();
  });
});
