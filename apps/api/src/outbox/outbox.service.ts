import { Injectable, Logger } from '@nestjs/common';
import { Prisma, OutboxEventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private prisma: PrismaService) {}

  writeEvent(
    tx: Prisma.TransactionClient,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Prisma.InputJsonValue,
  ) {
    return tx.outboxEvent.create({
      data: { aggregateType, aggregateId, eventType, payload },
    });
  }

  // Publish pending outbox events to the message queue.
  // TODO: replace logger stub with actual Redis/BullMQ publish (ADR-004/005)
  async publishPendingEvents(): Promise<void> {
    const events = await this.prisma.outboxEvent.findMany({
      where: { status: OutboxEventStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    for (const event of events) {
      try {
        this.logger.log(`[OUTBOX] Publishing ${event.eventType} for ${event.aggregateType}:${event.aggregateId}`);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: OutboxEventStatus.PUBLISHED, publishedAt: new Date() },
        });
      } catch (err) {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxEventStatus.FAILED,
            failedAt: new Date(),
            retryCount: { increment: 1 },
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }
}
