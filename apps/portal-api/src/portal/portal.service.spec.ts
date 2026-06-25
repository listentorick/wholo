import { Test } from '@nestjs/testing';
import { PortalService } from './portal.service';

const mockApi = { get: jest.fn(), patch: jest.fn() };

describe('PortalService (portal-api)', () => {
  let service: PortalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PortalService,
        { provide: 'ApiClientService', useValue: mockApi },
      ],
    })
      .overrideProvider(PortalService)
      .useFactory({ factory: () => new PortalService(mockApi as any) })
      .compile();

    service = module.get(PortalService);
  });

  it('calls GET /portal/me/distributors with the token', async () => {
    mockApi.get.mockResolvedValue([]);
    await service.getMyDistributors('tok-123');
    expect(mockApi.get).toHaveBeenCalledWith('/portal/me/distributors', 'tok-123');
  });

  it('returns the upstream response', async () => {
    const data = [{ id: 'dist-1', name: 'Winos', slug: 'winos', orderCount: 5, logoUrl: null, email: null, phone: null }];
    mockApi.get.mockResolvedValue(data);
    const result = await service.getMyDistributors('tok-123');
    expect(result).toEqual(data);
  });

  describe('getMyProfile', () => {
    it('calls GET /portal/me/profile with the token', async () => {
      mockApi.get.mockResolvedValue({ name: 'Acme' });
      await service.getMyProfile('tok-123');
      expect(mockApi.get).toHaveBeenCalledWith('/portal/me/profile', 'tok-123');
    });
  });

  describe('updateMyProfile', () => {
    it('calls PATCH /portal/me/profile with token and body', async () => {
      const body = { name: 'New Name' };
      mockApi.patch.mockResolvedValue({ name: 'New Name' });
      await service.updateMyProfile('tok-123', body);
      expect(mockApi.patch).toHaveBeenCalledWith('/portal/me/profile', 'tok-123', body);
    });
  });
});
