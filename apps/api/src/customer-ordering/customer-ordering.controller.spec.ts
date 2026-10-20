import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { CustomerOrderingController } from './customer-ordering.controller';

describe('CustomerOrderingController', () => {
  it('is guarded by auth, distributor access and permissions', () => {
    expect(Reflect.getMetadata('__guards__', CustomerOrderingController)).toEqual([JwtAuthGuard, DistributorAccessGuard, PermissionsGuard]);
  });

  it('needs analytics:read — spend and order frequency are sales figures', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CustomerOrderingController)).toEqual([Permission.ANALYTICS_READ]);
  });

  it('passes both ids to the service', async () => {
    const service = { getBehaviour: jest.fn().mockResolvedValue({ customerId: 'cust-1' }) };
    const controller = new CustomerOrderingController(service as never);

    await expect(controller.getBehaviour('dist-1', 'cust-1')).resolves.toEqual({ customerId: 'cust-1' });
    expect(service.getBehaviour).toHaveBeenCalledWith('dist-1', 'cust-1');
  });
});
