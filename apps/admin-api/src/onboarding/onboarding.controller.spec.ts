import { Test } from '@nestjs/testing';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { KeycloakJwtAuthGuard } from '../auth/guards/keycloak-jwt-auth.guard';

describe('OnboardingController', () => {
  let controller: OnboardingController;
  const service = { createDistributor: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [{ provide: OnboardingService, useValue: service }],
    }).compile();
    controller = module.get(OnboardingController);
  });

  it('guards createDistributor with the signature-only KeycloakJwtAuthGuard', () => {
    const guards =
      Reflect.getMetadata('__guards__', OnboardingController.prototype.createDistributor) ?? [];
    expect(guards).toContain(KeycloakJwtAuthGuard);
  });

  it('relays the dto with the principal token', async () => {
    const dto = { name: 'Acme' };
    service.createDistributor.mockResolvedValue({ id: 'org-1' });

    const result = await controller.createDistributor({ user: { sub: 'kc-1', token: 'tok-9' } } as never, dto as never);

    expect(result).toEqual({ id: 'org-1' });
    expect(service.createDistributor).toHaveBeenCalledWith('tok-9', dto);
  });
});
