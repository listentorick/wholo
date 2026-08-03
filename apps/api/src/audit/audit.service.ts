import { Injectable } from '@nestjs/common';
import { Prisma, ActorType } from '@prisma/client';

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
