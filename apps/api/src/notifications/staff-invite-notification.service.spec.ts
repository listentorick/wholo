import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationAudience, NotificationChannel, NotificationType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { StaffInviteNotificationService, StaffInviteSentEventPayload } from './staff-invite-notification.service';

const makeEvent = (overrides: Partial<StaffInviteSentEventPayload> = {}): StaffInviteSentEventPayload => ({
  invitationId: 'inv-1',
  distributorId: 'dist-1',
  email: 'sam.patel@vine.test',
  roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF],
  distributorName: 'Vine & Co',
  distributorEmail: null,
  distributorPhone: null,
  inviterName: 'Priya Shah',
  inviteUrl: 'http://admin.test/accept-invite?token=abc',
  expiresAt: '2026-09-23T00:00:00.000Z',
  ...overrides,
});

// In-memory stand-ins that honour the semantics the service relies on:
// upsert-on-dedupeKey, skipDuplicates, and BullMQ's jobId de-duplication.
function makeFakes() {
  const notifications = new Map<string, { id: string; type: NotificationType; distributorId: string; payload: Record<string, unknown> }>();
  const deliveries: { id: string; notificationId: string; channel: NotificationChannel; audience: NotificationAudience; recipient: string; status: string }[] = [];
  const jobs = new Map<string, unknown>();

  const prisma = {
    notification: {
      upsert: jest.fn(async ({ where, create }) => {
        if (!notifications.has(where.dedupeKey)) notifications.set(where.dedupeKey, { id: `notif-${notifications.size + 1}`, ...create });
        return notifications.get(where.dedupeKey);
      }),
    },
    notificationDelivery: {
      createMany: jest.fn(async ({ data }) => {
        for (const d of data) {
          const dup = deliveries.some((x) => x.notificationId === d.notificationId && x.channel === d.channel && x.recipient === d.recipient);
          if (!dup) deliveries.push({ id: `del-${deliveries.length + 1}`, status: 'PENDING', ...d });
        }
      }),
      findMany: jest.fn(async ({ where }) => deliveries.filter((d) => d.notificationId === where.notificationId && d.status === where.status)),
    },
  };
  const queue = { add: jest.fn(async (_name: string, data: unknown, opts: { jobId: string }) => void jobs.set(opts.jobId, data)) };
  return { notifications, deliveries, jobs, prisma, queue };
}

describe('StaffInviteNotificationService', () => {
  let service: StaffInviteNotificationService;
  let fakes: ReturnType<typeof makeFakes>;

  beforeEach(async () => {
    fakes = makeFakes();
    const module = await Test.createTestingModule({
      providers: [
        StaffInviteNotificationService,
        { provide: PrismaService, useValue: fakes.prisma },
        { provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE), useValue: fakes.queue },
      ],
    }).compile();
    service = module.get(StaffInviteNotificationService);
  });

  it('emails the invitee once, with human-readable role names and the invite link', async () => {
    await service.handleStaffInviteSent(makeEvent());

    const [notification] = [...fakes.notifications.values()];
    expect(notification.type).toBe(NotificationType.STAFF_INVITE_SENT);
    expect(notification.distributorId).toBe('dist-1');
    expect(notification.payload).toMatchObject({
      inviterName: 'Priya Shah',
      distributorName: 'Vine & Co',
      roleLabels: ['Operations manager', 'Warehouse staff'],
      recipientEmail: 'sam.patel@vine.test',
      inviteUrl: 'http://admin.test/accept-invite?token=abc',
    });
    expect(fakes.deliveries).toEqual([
      expect.objectContaining({ channel: NotificationChannel.EMAIL, audience: NotificationAudience.DISTRIBUTOR, recipient: 'sam.patel@vine.test' }),
    ]);
    expect(fakes.jobs.size).toBe(1);
  });

  it('is idempotent when the same event is delivered twice', async () => {
    await service.handleStaffInviteSent(makeEvent());
    await service.handleStaffInviteSent(makeEvent());

    expect(fakes.notifications.size).toBe(1);
    expect(fakes.deliveries).toHaveLength(1);
    expect(fakes.jobs.size).toBe(1);
  });

  it('treats a resend (a new invitation) as its own notification and email', async () => {
    await service.handleStaffInviteSent(makeEvent());
    await service.handleStaffInviteSent(makeEvent({ invitationId: 'inv-2', inviteUrl: 'http://admin.test/accept-invite?token=def' }));

    expect(fakes.notifications.size).toBe(2);
    expect(fakes.jobs.size).toBe(2);
  });
});
