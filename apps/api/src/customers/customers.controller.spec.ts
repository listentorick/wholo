import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UseGuards } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// The @ActingCustomerId() decorator resolves the order-as context vs. a plain
// JWT's organisationId — that resolution logic itself is covered by
// acting-customer.decorator.spec.ts. Here the controller is exercised with the
// already-resolved value, exactly as Nest's request pipeline would supply it.
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

  it('is protected by JwtAuthGuard', () => {
    const guards = Reflect.getMetadata('__guards__', CustomersController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('returns the record when the path customerId matches the authenticated customer', async () => {
    const result = await controller.getCustomer('dist-1', 'cust-1', 'cust-1');
    expect(result).toEqual({ id: 'rel-1' });
  });

  it('throws ForbiddenException when the path customerId is another customer', async () => {
    await expect(controller.getCustomer('dist-1', 'cust-other', 'cust-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('resolves the customer from the order-as context when present', async () => {
    // Simulates an admin acting as cust-2 during an order-as session — the
    // decorator would have resolved authCustomerId to the impersonated customer.
    const result = await controller.getCustomer('dist-1', 'cust-2', 'cust-2');
    expect(result).toEqual({ id: 'rel-1' });
  });

  it('rejects a mismatched path id even in order-as mode', async () => {
    // The admin's own organisationId ('dist-1') is not the impersonated customer.
    await expect(controller.getCustomer('dist-1', 'dist-1', 'cust-2')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
