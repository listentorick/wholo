import { Test } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { ApiClientService } from '../api-client/api-client.service';

const mockApi = {
  get: jest.fn(),
  patch: jest.fn(),
};

const mockSettingsResponse = {
  name: 'Acme Wines',
  email: 'hello@acme.com',
  phone: null,
  slug: 'acme-wines',
  defaultOrderAcceptanceMode: 'MANUAL',
  marketplaceVisible: false,
  marketplaceDescription: null,
  orderNotificationEmails: [],
};

describe('SettingsService (BFF)', () => {
  let service: SettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: ApiClientService, useValue: mockApi },
      ],
    }).compile();
    service = module.get(SettingsService);
  });

  describe('find', () => {
    it('calls api.get with correct path and distributorId', async () => {
      mockApi.get.mockResolvedValue(mockSettingsResponse);

      const result = await service.find('dist-1');

      expect(mockApi.get).toHaveBeenCalledWith('/admin/settings', 'dist-1');
      expect(result).toEqual(mockSettingsResponse);
    });
  });

  describe('update', () => {
    it('calls api.patch with correct path, distributorId, and body', async () => {
      const dto = { name: 'New Name', marketplaceVisible: true };
      mockApi.patch.mockResolvedValue({ ...mockSettingsResponse, ...dto });

      await service.update('dist-1', dto);

      expect(mockApi.patch).toHaveBeenCalledWith('/admin/settings', 'dist-1', dto);
    });
  });
});
