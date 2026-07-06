import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UseGuards } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ORDER_AS_CONTEXT_KEY } from '../order-as/order-as.interceptor';

describe('CustomersController', () => {
  let controller: CustomersController;
  let service: jest.Mocked<CustomersService>;

  beforeEach(async () => {
    const mockService = { getSelfView: jest.fn().mockResolvedValue({ id: 'rel-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [{ provide: CustomersService, useValue: mockService }],
    }).compile();

    controller = module.get(CustomersController);
    service = module.get(CustomersService) as jest.Mocked<CustomersService>;
  });

  function makeReq(overrides: Record<string, unknown> = {}) {
    return { user: { sub: 'user-1', organisationId: 'cust-1' }, ...overrides } as any;
  }

  it('is protected by JwtAuthGuard', () => {
    const guards = Reflect.getMetadata('__guards__', CustomersController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('returns the record when the path customerId matches the authenticated customer', async () => {
    const result = await controller.getCustomer('dist-1', 'cust-1', makeReq());
    expect(result).toEqual({ id: 'rel-1' });
  });

  it('throws ForbiddenException when the path customerId is another customer', async () => {
    await expect(controller.getCustomer('dist-1', 'cust-other', makeReq())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('resolves the customer from the order-as context when present', async () => {
    const req = makeReq({
      user: { sub: 'admin-1', organisationId: 'dist-1' },
      [ORDER_AS_CONTEXT_KEY]: { sessionToken: 'tok', customerId: 'cust-2', distributorId: 'dist-1' },
    });

    const result = await controller.getCustomer('dist-1', 'cust-2', req);
    expect(result).toEqual({ id: 'rel-1' });
  });

  it('rejects a mismatched path id even in order-as mode', async () => {
    const req = makeReq({
      user: { sub: 'admin-1', organisationId: 'dist-1' },
      [ORDER_AS_CONTEXT_KEY]: { sessionToken: 'tok', customerId: 'cust-2', distributorId: 'dist-1' },
    });

    // The admin's own organisationId is not the impersonated customer
    await expect(controller.getCustomer('dist-1', 'dist-1', req)).rejects.toThrow(ForbiddenException);
  });
});
