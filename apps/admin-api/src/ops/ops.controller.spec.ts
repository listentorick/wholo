import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

describe('OpsController', () => {
  const req = { user: { sub: 'op-1', token: 'tok' } } as never;

  it('requires a signed-in user for every route', () => {
    expect(Reflect.getMetadata('__guards__', OpsController)).toEqual([JwtAuthGuard]);
  });

  it('opens and lists access only for the caller, never a user named by the client', () => {
    const service = { openAccess: jest.fn(), myGrants: jest.fn() } as unknown as OpsService;
    const controller = new OpsController(service);
    const dto = { distributorId: 'dist-1', reason: 'Price lists', durationMinutes: 240 };

    controller.openAccess(req, dto);
    controller.myGrants(req);

    expect(service.openAccess).toHaveBeenCalledWith('op-1', dto, 'tok');
    expect(service.myGrants).toHaveBeenCalledWith('op-1', 'tok');
  });
});
