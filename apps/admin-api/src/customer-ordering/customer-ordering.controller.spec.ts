import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomerOrderingController } from './customer-ordering.controller';

describe('CustomerOrderingController (BFF)', () => {
  it('requires a signed-in user', () => {
    expect(Reflect.getMetadata('__guards__', CustomerOrderingController)).toEqual([JwtAuthGuard]);
  });

  it("asks for the customer on behalf of the signed-in user's distributor", async () => {
    const service = { getBehaviour: jest.fn().mockResolvedValue({ customerId: 'cust-1' }) };
    const controller = new CustomerOrderingController(service as never);
    const req = { user: { organisationId: 'dist-1', token: 'token-1' } };

    await expect(controller.getBehaviour(req as never, 'cust-1')).resolves.toEqual({ customerId: 'cust-1' });
    expect(service.getBehaviour).toHaveBeenCalledWith('dist-1', 'cust-1', 'token-1');
  });
});
