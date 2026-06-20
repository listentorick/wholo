import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrganisationType } from '@prisma/client';
import { DeliveryAvailabilityController } from './delivery-availability.controller';
import { DeliveryAvailabilityService } from './delivery-availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_AS_CONTEXT_KEY } from '../order-as/order-as.interceptor';

describe('DeliveryAvailabilityController', () => {
  let controller: DeliveryAvailabilityController;
  let service: jest.Mocked<DeliveryAvailabilityService>;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockService = { getAvailableDates: jest.fn().mockResolvedValue({ dates: [], profileId: null }) };
    const mockPrisma = { organisation: { findFirst: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryAvailabilityController],
      providers: [
        { provide: DeliveryAvailabilityService, useValue: mockService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get(DeliveryAvailabilityController);
    service = module.get(DeliveryAvailabilityService) as jest.Mocked<DeliveryAvailabilityService>;
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  function makeReq(overrides: Record<string, unknown> = {}) {
    return { user: { sub: 'user-1', organisationId: 'dist-1' }, ...overrides } as any;
  }

  it('throws NotFoundException when distributor slug is not found', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(controller.getAvailableDates('bad-slug', makeReq())).rejects.toThrow(NotFoundException);
  });

  it('uses req.user.organisationId when no order-as context', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue({ id: 'dist-1' });

    await controller.getAvailableDates('winos', makeReq());

    expect(service.getAvailableDates).toHaveBeenCalledWith('dist-1', 'dist-1');
  });

  it('uses orderAs.customerId when order-as context is present', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue({ id: 'dist-1' });

    const req = makeReq({
      [ORDER_AS_CONTEXT_KEY]: { sessionToken: 'tok', customerId: 'cust-1', distributorId: 'dist-1' },
    });

    await controller.getAvailableDates('winos', req);

    expect(service.getAvailableDates).toHaveBeenCalledWith('dist-1', 'cust-1');
  });
});
