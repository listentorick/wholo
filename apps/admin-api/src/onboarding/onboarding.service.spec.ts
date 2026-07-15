import { Test } from '@nestjs/testing';
import { OnboardingService } from './onboarding.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  const api = { post: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [OnboardingService, { provide: ApiClientService, useValue: api }],
    }).compile();
    service = module.get(OnboardingService);
  });

  it('relays the create to POST /distributors with the bearer token', async () => {
    const dto = {
      name: 'Acme Wines',
      addressLine1: '1 Barrel Way',
      addressCity: 'Leeds',
      addressPostcode: 'LS1 1AA',
      addressCountry: 'United Kingdom',
    };
    const org = { id: 'org-1', slug: 'acme-wines' };
    api.post.mockResolvedValue(org);

    await expect(service.createDistributor('tok-1', dto as never)).resolves.toEqual(org);
    expect(api.post).toHaveBeenCalledWith('/distributors', 'tok-1', dto);
  });
});
