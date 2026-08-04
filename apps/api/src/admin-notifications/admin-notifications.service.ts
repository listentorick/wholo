import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminNotification, Prisma, Role } from '@prisma/client';
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

export type NotifyOrganisationAdminsInput = Omit<CreateAdminNotificationInput, 'userId' | 'organisationId'>;

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

  // Fan-out for events with no single triggering admin user (an order placed
  // by a trade customer, a system-driven invoice export) — every
  // DISTRIBUTOR_ADMIN at the organisation gets their own row. Same
  // direct-write semantics as create(): no outbox, this IS the terminal write.
  async notifyOrganisationAdmins(organisationId: string, input: NotifyOrganisationAdminsInput): Promise<void> {
    const admins = await this.prisma.membership.findMany({
      where: { organisationId, role: Role.DISTRIBUTOR_ADMIN },
      select: { userId: true },
    });
    if (admins.length === 0) return;

    await this.prisma.adminNotification.createMany({
      data: admins.map((admin) => ({
        ...input,
        organisationId,
        userId: admin.userId,
        payload: input.payload ?? {},
      })),
    });
  }

  list(userId: string, organisationId: string, limit = 20): Promise<AdminNotification[]> {
    return this.prisma.adminNotification.findMany({
      where: { userId, organisationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  unreadCount(userId: string, organisationId: string): Promise<number> {
    return this.prisma.adminNotification.count({ where: { userId, organisationId, readAt: null } });
  }

  async markRead(userId: string, organisationId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.adminNotification.updateMany({
      where: { id: notificationId, userId, organisationId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count > 0) return;

    // No row updated — either it doesn't belong to this user/org (404) or it
    // was already read (idempotent no-op, not an error).
    const exists = await this.prisma.adminNotification.findFirst({
      where: { id: notificationId, userId, organisationId },
    });
    if (!exists) {
      throw new NotFoundException('Notification not found');
    }
  }

  async markAllRead(userId: string, organisationId: string): Promise<void> {
    await this.prisma.adminNotification.updateMany({
      where: { userId, organisationId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
