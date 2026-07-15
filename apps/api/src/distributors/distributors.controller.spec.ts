import { Test } from '@nestjs/testing';
import { UseGuards } from '@nestjs/common';
import { DistributorsController } from './distributors.controller';
import { DistributorsService } from './distributors.service';
import { KeycloakIdentityGuard } from '../auth/guards/keycloak-identity.guard';

describe('DistributorsController', () => {
  let controller: DistributorsController;
  const service = { createForIdentity: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [DistributorsController],
      providers: [{ provide: DistributorsService, useValue: service }],
    }).compile();
    controller = module.get(DistributorsController);
  });

  it('guards create with KeycloakIdentityGuard (identity-only auth, no Wholo user required)', () => {
    const guards = Reflect.getMetadata('__guards__', DistributorsController.prototype.create) ?? [];
    expect(guards).toContain(KeycloakIdentityGuard);
  });

  it('delegates to the service with the token identity and dto', async () => {
    const identity = { sub: 'kc-1', email: 'a@b.c', email_verified: true };
    const dto = {
      name: 'Acme',
      addressLine1: '1 Way',
      addressCity: 'Leeds',
      addressPostcode: 'LS1',
      addressCountry: 'UK',
    };
    service.createForIdentity.mockResolvedValue({ id: 'org-1' });

    const result = await controller.create({ user: identity } as never, dto as never);

    expect(result).toEqual({ id: 'org-1' });
    expect(service.createForIdentity).toHaveBeenCalledWith(identity, dto);
  });
});
