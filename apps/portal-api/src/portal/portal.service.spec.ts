import { Test } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PortalService } from './portal.service';

const mockApi = { get: jest.fn(), patch: jest.fn(), post: jest.fn() };

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

  it('calls GET /organisations/:organisationId/distributors with the token', async () => {
    mockApi.get.mockResolvedValue([]);
    await service.getMyDistributors('org-1', 'tok-123');
    expect(mockApi.get).toHaveBeenCalledWith('/organisations/org-1/distributors', 'tok-123');
  });

  it('returns the upstream response', async () => {
    const data = [{ id: 'dist-1', name: 'Winos', slug: 'winos', orderCount: 5, logoUrl: null, email: null, phone: null }];
    mockApi.get.mockResolvedValue(data);
    const result = await service.getMyDistributors('org-1', 'tok-123');
    expect(result).toEqual(data);
  });

  describe('getRecommendedDistributors', () => {
    it('calls GET /organisations/:organisationId/recommended-distributors with the token', async () => {
      mockApi.get.mockResolvedValue([]);
      await service.getRecommendedDistributors('org-1', 'tok-123');
      expect(mockApi.get).toHaveBeenCalledWith('/organisations/org-1/recommended-distributors', 'tok-123');
    });
  });

  describe('getMyProfile', () => {
    it('calls GET /organisations/:organisationId with the token', async () => {
      mockApi.get.mockResolvedValue({ name: 'Acme' });
      await service.getMyProfile('org-1', 'tok-123');
      expect(mockApi.get).toHaveBeenCalledWith('/organisations/org-1', 'tok-123');
    });
  });

  describe('updateMyProfile', () => {
    it('calls PATCH /organisations/:organisationId with token and body', async () => {
      const body = { name: 'New Name' };
      mockApi.patch.mockResolvedValue({ name: 'New Name' });
      await service.updateMyProfile('org-1', 'tok-123', body);
      expect(mockApi.patch).toHaveBeenCalledWith('/organisations/org-1', 'tok-123', body);
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

  describe('getDistributorRelationship', () => {
    it('resolves the slug then returns the customer record', async () => {
      mockApi.get
        .mockResolvedValueOnce({ id: 'dist-1' })
        .mockResolvedValueOnce({ id: 'rel-1', status: 'ACTIVE' });

      const result = await service.getDistributorRelationship('tok-123', 'winos', 'cust-1');

      expect(mockApi.get).toHaveBeenNthCalledWith(1, '/distributors/winos', 'tok-123');
      expect(mockApi.get).toHaveBeenNthCalledWith(2, '/distributors/dist-1/customers/cust-1', 'tok-123');
      expect(result).toEqual({ id: 'rel-1', status: 'ACTIVE' });
    });

    it('returns null when the customer has no relationship with the distributor (404)', async () => {
      mockApi.get
        .mockResolvedValueOnce({ id: 'dist-1' })
        .mockRejectedValueOnce(new HttpException('Customer not found', HttpStatus.NOT_FOUND));

      const result = await service.getDistributorRelationship('tok-123', 'winos', 'cust-1');
      expect(result).toBeNull();
    });

    it('propagates a non-404 upstream failure', async () => {
      mockApi.get
        .mockResolvedValueOnce({ id: 'dist-1' })
        .mockRejectedValueOnce(new HttpException('Forbidden', HttpStatus.FORBIDDEN));

      await expect(service.getDistributorRelationship('tok-123', 'winos', 'cust-1')).rejects.toThrow('Forbidden');
    });

    // apps/api now returns the full Customer record (staff fields included) to
    // any authorized caller — this BFF is what must strip them before the
    // portal frontend ever sees the response.
    it('strips the distributor-only fields from the upstream response', async () => {
      mockApi.get
        .mockResolvedValueOnce({ id: 'dist-1' })
        .mockResolvedValueOnce({
          id: 'rel-1',
          status: 'ACTIVE',
          notes: 'VIP — always calls ahead',
          creditLimit: '5000.00',
          priceListId: 'pl-1',
          priceList: { id: 'pl-1', name: 'Trade' },
          deliveryProfileId: 'dp-1',
          deliveryProfile: { id: 'dp-1', name: 'Tuesdays' },
          catalogues: [{ id: 'cat-1', name: 'Core range' }],
          invitations: [{ id: 'inv-1', email: 'a@b.com', status: 'PENDING', expiresAt: '2026-01-01', createdAt: '2026-01-01' }],
        });

      const result = await service.getDistributorRelationship('tok-123', 'winos', 'cust-1');

      expect(result).toEqual({ id: 'rel-1', status: 'ACTIVE' });
      expect(result).not.toHaveProperty('notes');
      expect(result).not.toHaveProperty('creditLimit');
      expect(result).not.toHaveProperty('priceListId');
      expect(result).not.toHaveProperty('priceList');
      expect(result).not.toHaveProperty('deliveryProfileId');
      expect(result).not.toHaveProperty('deliveryProfile');
      expect(result).not.toHaveProperty('catalogues');
      expect(result).not.toHaveProperty('invitations');
    });
  });

  describe('requestDistributorAccess', () => {
    it('resolves the slug then POSTs the self-declared answer', async () => {
      mockApi.get.mockResolvedValueOnce({ id: 'dist-1' });
      mockApi.post.mockResolvedValueOnce({ id: 'rel-1', status: 'PENDING_REQUEST' });

      const result = await service.requestDistributorAccess('tok-123', 'winos', 'cust-1', true);

      expect(mockApi.get).toHaveBeenCalledWith('/distributors/winos', 'tok-123');
      expect(mockApi.post).toHaveBeenCalledWith(
        '/distributors/dist-1/customers/cust-1',
        'tok-123',
        { recentContact: true },
      );
      expect(result).toEqual({ id: 'rel-1', status: 'PENDING_REQUEST' });
    });

    it('strips the distributor-only fields from the upstream response', async () => {
      mockApi.get.mockResolvedValueOnce({ id: 'dist-1' });
      mockApi.post.mockResolvedValueOnce({
        id: 'rel-1',
        status: 'PENDING_REQUEST',
        notes: 'internal note',
        creditLimit: '1000.00',
        priceListId: null,
        priceList: null,
        deliveryProfileId: null,
        deliveryProfile: null,
        catalogues: [],
        invitations: [],
      });

      const result = await service.requestDistributorAccess('tok-123', 'winos', 'cust-1', true);

      expect(result).toEqual({ id: 'rel-1', status: 'PENDING_REQUEST' });
      expect(result).not.toHaveProperty('notes');
      expect(result).not.toHaveProperty('creditLimit');
    });
  });
});
