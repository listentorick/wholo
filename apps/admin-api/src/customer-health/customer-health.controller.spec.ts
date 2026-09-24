import { Test } from '@nestjs/testing';
import { CustomerHealthController } from './customer-health.controller';
import { CustomerHealthService } from './customer-health.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const req = { user: { organisationId: 'dist-1', token: 'token-1' } } as never;

describe('CustomerHealthController (BFF)', () => {
  let controller: CustomerHealthController;
  let service: { getHealth: jest.Mock };

  beforeEach(async () => {
    service = { getHealth: jest.fn().mockResolvedValue({ a: 1 }) };
    const module = await Test.createTestingModule({
      controllers: [CustomerHealthController],
      providers: [{ provide: CustomerHealthService, useValue: service }],
    }).compile();
    controller = module.get(CustomerHealthController);
  });

  it('requires a signed-in user', () => {
    expect(Reflect.getMetadata('__guards__', CustomerHealthController)).toEqual([JwtAuthGuard]);
  });

  it("serves customer health for the caller's own distributor", async () => {
    await expect(controller.getHealth(req)).resolves.toEqual({ a: 1 });
    expect(service.getHealth).toHaveBeenCalledWith('dist-1', 'token-1');
  });
});
