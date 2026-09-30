import { Injectable } from '@nestjs/common';
import { Prisma, ActorType } from '@prisma/client';

// Who caused a change, for services that record audit rows on a caller's
// behalf (a sync job, a driver link, a signed-in user).
export interface AuditActor {
  type: ActorType;
  userId?: string;
  name?: string;
}

@Injectable()
export class AuditService {
  record(
    tx: Prisma.TransactionClient,
    params: {
      distributorId: string;
      entityType: string;
      entityId: string;
      action: string;
      actorType: ActorType;
      actorUserId?: string;
      actorName?: string;
      summary: string;
      changes?: Prisma.InputJsonValue;
    },
  ) {
    return tx.auditLog.create({ data: params });
  }
}
