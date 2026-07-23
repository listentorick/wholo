import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminNotification, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAdminNotificationInput {
  organisationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  linkPath?: string;
  payload?: Prisma.InputJsonValue;
}

// A per-admin-user in-app notification inbox — distinct from the
// Notification/NotificationDelivery transactional-email pipeline
// (apps/api/src/notifications), which is organisation/email-keyed and has no
// read state. create() is called directly (no outbox) because an in-app
// notification IS the terminal write; there's no further fan-out to trigger.
@Injectable()
export class AdminNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateAdminNotificationInput): Promise<AdminNotification> {
    return this.prisma.adminNotification.create({
      data: { ...input, payload: input.payload ?? {} },
    });
  }

  list(userId: string, limit = 20): Promise<AdminNotification[]> {
    return this.prisma.adminNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.adminNotification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.adminNotification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count > 0) return;

    // No row updated — either it doesn't belong to this user (404) or it was
    // already read (idempotent no-op, not an error).
    const exists = await this.prisma.adminNotification.findFirst({ where: { id: notificationId, userId } });
    if (!exists) {
      throw new NotFoundException('Notification not found');
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.adminNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
