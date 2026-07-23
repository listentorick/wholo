import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminNotificationsService } from './admin-notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;
  let prisma: {
    adminNotification: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      adminNotification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminNotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminNotificationsService);
  });

  describe('create', () => {
    it('creates a notification, defaulting payload to an empty object', async () => {
      prisma.adminNotification.create.mockResolvedValue({ id: 'n1' });

      await service.create({
        organisationId: 'org-1',
        userId: 'user-1',
        type: 'ACCOUNTING_BULK_IMPORT_COMPLETED',
        title: 'Import complete',
        body: '10 of 10 imported',
      });

      expect(prisma.adminNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1', payload: {} }),
      });
    });
  });

  describe('list', () => {
    it('returns the user notifications newest first, respecting the limit', async () => {
      prisma.adminNotification.findMany.mockResolvedValue([{ id: 'n1' }]);

      const result = await service.list('user-1', 5);

      expect(prisma.adminNotification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      expect(result).toEqual([{ id: 'n1' }]);
    });
  });

  describe('unreadCount', () => {
    it('counts unread notifications for the user', async () => {
      prisma.adminNotification.count.mockResolvedValue(3);

      const result = await service.unreadCount('user-1');

      expect(prisma.adminNotification.count).toHaveBeenCalledWith({ where: { userId: 'user-1', readAt: null } });
      expect(result).toBe(3);
    });
  });

  describe('markRead', () => {
    it('marks a matching unread notification as read', async () => {
      prisma.adminNotification.updateMany.mockResolvedValue({ count: 1 });

      await service.markRead('user-1', 'n1');

      expect(prisma.adminNotification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(prisma.adminNotification.findFirst).not.toHaveBeenCalled();
    });

    it('is idempotent when the notification is already read', async () => {
      prisma.adminNotification.updateMany.mockResolvedValue({ count: 0 });
      prisma.adminNotification.findFirst.mockResolvedValue({ id: 'n1' });

      await expect(service.markRead('user-1', 'n1')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when the notification does not belong to the user', async () => {
      prisma.adminNotification.updateMany.mockResolvedValue({ count: 0 });
      prisma.adminNotification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('user-1', 'n1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('marks every unread notification for the user as read', async () => {
      prisma.adminNotification.updateMany.mockResolvedValue({ count: 4 });

      await service.markAllRead('user-1');

      expect(prisma.adminNotification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
