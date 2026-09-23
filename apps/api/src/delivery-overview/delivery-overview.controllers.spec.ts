import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { DeliveryOverviewController } from './delivery-overview.controller';
import { DeliveryOutcomesController } from './delivery-outcomes.controller';
import { DeliveryOverviewService } from './delivery-overview.service';
import { DeliveryOutcomesService } from './delivery-outcomes.service';

describe.each([
  ['DeliveryOverviewController', DeliveryOverviewController],
  ['DeliveryOutcomesController', DeliveryOutcomesController],
])('%s access control', (_name, controller) => {
  it('is guarded by the JWT, distributor-scope and permission guards', () => {
    expect(Reflect.getMetadata('__guards__', controller)).toEqual([JwtAuthGuard, DistributorAccessGuard, PermissionsGuard]);
  });

  it('requires both orders:read and delivery:read (all are required), and not analytics:read', () => {
    const required = Reflect.getMetadata(PERMISSIONS_KEY, controller) as Permission[];
    expect([...required].sort()).toEqual([Permission.DELIVERY_READ, Permission.ORDERS_READ].sort());
  });
});

describe('DeliveryOverviewController', () => {
  it('reads the overview for the distributor in the path', async () => {
    const snapshot = { distributorId: 'dist-1' };
    const service = { getOverview: jest.fn().mockResolvedValue(snapshot) };
    const controller = new DeliveryOverviewController(service as unknown as DeliveryOverviewService);

    await expect(controller.overview('dist-1')).resolves.toBe(snapshot);
    expect(service.getOverview).toHaveBeenCalledWith('dist-1');
  });
});

describe('DeliveryOutcomesController', () => {
  it('reads the series for the distributor and window given', async () => {
    const series = { days: [] };
    const service = { getDays: jest.fn().mockResolvedValue(series) };
    const controller = new DeliveryOutcomesController(service as unknown as DeliveryOutcomesService);

    await expect(controller.days('dist-1', { from: '2026-09-11', to: '2026-09-17' })).resolves.toBe(series);
    expect(service.getDays).toHaveBeenCalledWith('dist-1', '2026-09-11', '2026-09-17');
  });
});
