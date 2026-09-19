import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { KEYCLOAK_USER_QUEUE } from '../queues/queue.constants';
import { KeycloakAdminService } from './keycloak-admin.service';

interface StaffKeycloakDisableJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  payload: { userId?: string; keycloakId?: string };
}

// Consumes StaffKeycloakDisableRequested (written in the same transaction that
// removes a team member — ADR-067). Idempotent: disabling an already-disabled
// Keycloak user is a no-op, so an at-least-once redelivery is harmless, and a
// failure throws so BullMQ retries with backoff.
@Processor(KEYCLOAK_USER_QUEUE)
export class StaffKeycloakDisableProcessor extends WorkerHost {
  private readonly logger = new Logger(StaffKeycloakDisableProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keycloak: KeycloakAdminService,
  ) {
    super();
  }

  async process(job: Job<StaffKeycloakDisableJobData>): Promise<void> {
    if (job.name !== 'StaffKeycloakDisableRequested') {
      this.logger.warn(`No handler for event type '${job.name}' (event ${job.data.eventId}); ignoring`);
      return;
    }
    const { userId, keycloakId } = job.data.payload ?? {};
    if (!userId || !keycloakId) {
      this.logger.warn(`Event ${job.data.eventId} carries no userId/keycloakId — skipping`);
      return;
    }

    // Re-read rather than trust the event: only disable someone who is STILL
    // removed. (If a person were ever restored before this ran, locking them
    // out of Keycloak now would be wrong.)
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deletedAt: true, keycloakId: true } });
    if (!user || !user.deletedAt) {
      this.logger.log(`User ${userId} is not removed — not disabling their Keycloak account`);
      return;
    }
    // Disable the identity we actually have on record, not one from the payload.
    await this.keycloak.disableUser(user.keycloakId ?? keycloakId);
  }
}
