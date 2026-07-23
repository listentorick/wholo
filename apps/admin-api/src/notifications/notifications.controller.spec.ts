import { Test } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const mockService = {
  list: jest.fn(),
  unreadCount: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
};

function mockRequest() {
  return { user: { sub: 'user-1', token: 'token-1' } } as unknown as import('express').Request;
}

describe('NotificationsController (BFF)', () => {
  let controller: NotificationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockService }],
    }).compile();
    controller = module.get(NotificationsController);
  });

  it('list resolves the JWT sub into the explicit userId, never a client-supplied id', async () => {
    await controller.list('5', mockRequest());
    expect(mockService.list).toHaveBeenCalledWith('user-1', '5', 'token-1');
  });

  it('unreadCount resolves the JWT sub into the explicit userId', async () => {
    await controller.unreadCount(mockRequest());
    expect(mockService.unreadCount).toHaveBeenCalledWith('user-1', 'token-1');
  });

  it('markRead resolves the JWT sub into the explicit userId and forwards the notification id', async () => {
    await controller.markRead('notif-1', mockRequest());
    expect(mockService.markRead).toHaveBeenCalledWith('user-1', 'notif-1', 'token-1');
  });

  it('markAllRead resolves the JWT sub into the explicit userId', async () => {
    await controller.markAllRead(mockRequest());
    expect(mockService.markAllRead).toHaveBeenCalledWith('user-1', 'token-1');
  });
});
