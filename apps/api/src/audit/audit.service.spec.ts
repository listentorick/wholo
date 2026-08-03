import { ActorType } from '@prisma/client';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let tx: { auditLog: { create: jest.Mock } };

  beforeEach(() => {
    service = new AuditService();
    tx = { auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) } };
  });

  it('writes an audit log row with the given params inside the provided transaction client', async () => {
    const params = {
      distributorId: 'dist-1',
      entityType: 'ORDER',
      entityId: 'order-1',
      action: 'ORDER_ACCEPTED',
      actorType: ActorType.USER,
      actorUserId: 'user-1',
      actorName: 'Jane Doe',
      summary: 'Accepted the order',
    };

    await service.record(tx as any, params);

    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: params });
  });

  it('accepts a SYSTEM actor with no actorUserId/actorName', async () => {
    const params = {
      distributorId: 'dist-1',
      entityType: 'ORDER',
      entityId: 'order-1',
      action: 'ORDER_ACCEPTED',
      actorType: ActorType.SYSTEM,
      summary: 'Auto-accepted the order',
    };

    await service.record(tx as any, params);

    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: params });
  });

  it('accepts optional structured changes', async () => {
    const params = {
      distributorId: 'dist-1',
      entityType: 'ORDER',
      entityId: 'order-1',
      action: 'ORDER_REJECTED',
      actorType: ActorType.USER,
      actorUserId: 'user-1',
      actorName: 'Jane Doe',
      summary: 'Rejected the order',
      changes: { reason: 'Out of stock' },
    };

    await service.record(tx as any, params);

    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: params });
  });
});
