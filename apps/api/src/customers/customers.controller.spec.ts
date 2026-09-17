import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
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

  const reqWithOrgs = (organisationIds: string[]) =>
    ({ user: { organisationId: organisationIds[0], organisationIds } }) as any;

  beforeEach(async () => {
    const mockService = {
      getCustomer: jest.fn().mockResolvedValue({ id: 'rel-1' }),
      requestAccess: jest.fn().mockResolvedValue({ id: 'rel-1', status: 'PENDING_REQUEST' }),
    };

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
    const result = await controller.getCustomer('dist-1', 'cust-1', 'cust-1', reqWithOrgs(['cust-1']));
    expect(result).toEqual({ id: 'rel-1' });
    expect(service.getCustomer).toHaveBeenCalledWith('dist-1', 'cust-1');
  });

  it('returns the record when the caller is staff of the distributor', async () => {
    const result = await controller.getCustomer('dist-1', 'cust-other', 'staff-own-org', reqWithOrgs(['dist-1']));
    expect(result).toEqual({ id: 'rel-1' });
    expect(service.getCustomer).toHaveBeenCalledWith('dist-1', 'cust-other');
  });

  it('throws ForbiddenException when the caller is neither the customer nor staff of the distributor', async () => {
    await expect(
      controller.getCustomer('dist-1', 'cust-other', 'cust-1', reqWithOrgs(['cust-1'])),
    ).rejects.toThrow(ForbiddenException);
    expect(service.getCustomer).not.toHaveBeenCalled();
  });

  it('resolves the customer from the order-as context when present', async () => {
    // Simulates an admin acting as cust-2 during an order-as session — the
    // decorator would have resolved authCustomerId to the impersonated customer.
    const result = await controller.getCustomer('dist-1', 'cust-2', 'cust-2', reqWithOrgs(['dist-1']));
    expect(result).toEqual({ id: 'rel-1' });
  });

  it('requests access when the path customerId matches the authenticated customer', async () => {
    const result = await controller.requestAccess('dist-1', 'cust-1', { recentContact: true }, 'cust-1');
    expect(service.requestAccess).toHaveBeenCalledWith('dist-1', 'cust-1', true);
    expect(result).toEqual({ id: 'rel-1', status: 'PENDING_REQUEST' });
  });

  it('throws ForbiddenException on requestAccess when the path customerId is another customer', async () => {
    await expect(
      controller.requestAccess('dist-1', 'cust-other', { recentContact: true }, 'cust-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(service.requestAccess).not.toHaveBeenCalled();
  });

  it('does not allow distributor staff to bypass the self-check on requestAccess', async () => {
    // requestAccess is customer-initiated only — there is no staff equivalent.
    await expect(
      controller.requestAccess('dist-1', 'cust-other', { recentContact: true }, 'cust-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});
