import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrganisationType } from '@prisma/client';
import { DeliveryAvailabilityController } from './delivery-availability.controller';
import { DeliveryAvailabilityService } from './delivery-availability.service';
import { PrismaService } from '../prisma/prisma.service';

// The @ActingCustomerId() decorator resolves the order-as context vs. a plain
// JWT's organisationId — that resolution logic itself is covered by
// acting-customer.decorator.spec.ts. Here the controller is exercised with the
// already-resolved value, exactly as Nest's request pipeline would supply it.
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

  it('throws NotFoundException when distributor slug is not found', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(controller.getAvailableDates('bad-slug', 'dist-1')).rejects.toThrow(NotFoundException);
  });

  it('passes the resolved customerId through to the service (no order-as session)', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue({ id: 'dist-1' });

    await controller.getAvailableDates('winos', 'dist-1');

    expect(service.getAvailableDates).toHaveBeenCalledWith('dist-1', 'dist-1');
  });

  it('passes the impersonated customerId through when an order-as session resolved it', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue({ id: 'dist-1' });

    await controller.getAvailableDates('winos', 'cust-1');

    expect(service.getAvailableDates).toHaveBeenCalledWith('dist-1', 'cust-1');
  });
});
