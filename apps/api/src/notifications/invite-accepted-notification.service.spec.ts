import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationAudience, NotificationChannel, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { CustomerInviteAcceptedEventPayload, InviteAcceptedNotificationService } from './invite-accepted-notification.service';

const customerEvent = (overrides: Partial<CustomerInviteAcceptedEventPayload> = {}): CustomerInviteAcceptedEventPayload => ({
  invitationId: 'inv-1',
  distributorId: 'dist-1',
  invitationEmail: 'orders@rustyanchor.test',
  acceptedByName: 'Rick Walsh',
  acceptedByEmail: 'rick@rustyanchor.test',
  acceptedWithCode: true,
  distributorName: 'Vine & Co',
  distributorEmail: 'hello@vineandco.test',
  distributorPhone: null,
  customerName: 'The Rusty Anchor',
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

describe('InviteAcceptedNotificationService', () => {
  let service: InviteAcceptedNotificationService;
  let fakes: ReturnType<typeof makeFakes>;

  beforeEach(async () => {
    fakes = makeFakes();
    const module = await Test.createTestingModule({
      providers: [
        InviteAcceptedNotificationService,
        { provide: PrismaService, useValue: fakes.prisma },
        { provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE), useValue: fakes.queue },
      ],
    }).compile();
    service = module.get(InviteAcceptedNotificationService);
  });

  it('emails the invited address that a portal invitation was accepted, and by whom', async () => {
    await service.handleCustomerInviteAccepted(customerEvent());

    const [notification] = [...fakes.notifications.values()];
    expect(notification.type).toBe(NotificationType.CUSTOMER_INVITE_ACCEPTED);
    expect(notification.payload).toMatchObject({
      businessName: 'The Rusty Anchor',
      distributorName: 'Vine & Co',
      recipientEmail: 'orders@rustyanchor.test',
      acceptedByName: 'Rick Walsh',
      acceptedByEmail: 'rick@rustyanchor.test',
      contactName: 'Vine & Co',
      contactEmail: 'hello@vineandco.test',
    });
    expect(fakes.deliveries).toEqual([
      expect.objectContaining({ channel: NotificationChannel.EMAIL, audience: NotificationAudience.CUSTOMER, recipient: 'orders@rustyanchor.test' }),
    ]);
    expect(fakes.jobs.size).toBe(1);
  });

  it('emails the invited address for a staff invitation, naming the distributor as the business', async () => {
    const { customerName: _omit, ...staff } = customerEvent({ invitationEmail: 'sam@vine.test' });
    await service.handleStaffInviteAccepted(staff);

    const [notification] = [...fakes.notifications.values()];
    expect(notification.type).toBe(NotificationType.STAFF_INVITE_ACCEPTED);
    expect(notification.payload).toMatchObject({ businessName: 'Vine & Co', distributorName: null, recipientEmail: 'sam@vine.test' });
    expect(fakes.deliveries[0]).toMatchObject({ audience: NotificationAudience.DISTRIBUTOR, recipient: 'sam@vine.test' });
  });

  it('sends once when the same event is delivered twice', async () => {
    await service.handleCustomerInviteAccepted(customerEvent());
    await service.handleCustomerInviteAccepted(customerEvent());

    expect(fakes.notifications.size).toBe(1);
    expect(fakes.deliveries).toHaveLength(1);
    expect(fakes.jobs.size).toBe(1);
  });

  it('sends nothing when the invited address accepted for itself, with no code', async () => {
    await service.handleCustomerInviteAccepted(customerEvent({ acceptedWithCode: false }));
    await service.handleStaffInviteAccepted({ ...customerEvent({ acceptedWithCode: false }), invitationId: 'staff-inv-1' });
    expect(fakes.notifications.size).toBe(0);
    expect(fakes.deliveries).toHaveLength(0);
  });

  it('skips events written before acceptance notices existed', async () => {
    await service.handleCustomerInviteAccepted(customerEvent({ invitationEmail: undefined as unknown as string }));
    expect(fakes.notifications.size).toBe(0);
  });
});
