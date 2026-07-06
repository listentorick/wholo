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

  describe('getMyDeliveryAddress', () => {
    const customerRecord = {
      deliveryLine1: '1 Wine Lane',
      deliveryLine2: null,
      deliveryCity: 'Melbourne',
      deliveryState: 'VIC',
      deliveryPostcode: '3000',
      deliveryCountry: 'Australia',
    };

    it('resolves the slug then returns the delivery address from the customer record', async () => {
      mockApi.get
        .mockResolvedValueOnce({ id: 'dist-1' })
        .mockResolvedValueOnce(customerRecord);

      const result = await service.getMyDeliveryAddress('tok-123', 'winos', 'cust-1');

      expect(mockApi.get).toHaveBeenNthCalledWith(1, '/distributors/winos', 'tok-123');
      expect(mockApi.get).toHaveBeenNthCalledWith(2, '/distributors/dist-1/customers/cust-1', 'tok-123');
      expect(result).toEqual({
        deliveryAddress: {
          line1: '1 Wine Lane',
          line2: null,
          city: 'Melbourne',
          state: 'VIC',
          postcode: '3000',
          country: 'Australia',
        },
      });
    });

    it('returns a null address when all delivery fields are null', async () => {
      mockApi.get
        .mockResolvedValueOnce({ id: 'dist-1' })
        .mockResolvedValueOnce({
          deliveryLine1: null, deliveryLine2: null, deliveryCity: null,
          deliveryState: null, deliveryPostcode: null, deliveryCountry: null,
        });

      const result = await service.getMyDeliveryAddress('tok-123', 'winos', 'cust-1');
      expect(result).toEqual({ deliveryAddress: null });
    });

    it('propagates an upstream failure (e.g. unknown distributor)', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Distributor not found'));

      await expect(service.getMyDeliveryAddress('tok-123', 'nope', 'cust-1')).rejects.toThrow(
        'Distributor not found',
      );
    });
  });
});
