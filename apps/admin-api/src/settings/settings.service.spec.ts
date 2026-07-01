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
    it('calls api.get with correct path and bearer token', async () => {
      mockApi.get.mockResolvedValue(mockSettingsResponse);

      const result = await service.find('dist-1', 'token-1');

      expect(mockApi.get).toHaveBeenCalledWith('/admin/distributors/dist-1/settings', 'token-1');
      expect(result).toEqual(mockSettingsResponse);
    });
  });

  describe('update', () => {
    it('calls api.patch with correct path, body, and bearer token', async () => {
      const dto = { name: 'New Name', marketplaceVisible: true };
      mockApi.patch.mockResolvedValue({ ...mockSettingsResponse, ...dto });

      await service.update('dist-1', dto, 'token-1');

      expect(mockApi.patch).toHaveBeenCalledWith('/admin/distributors/dist-1/settings', 'token-1', dto);
    });
  });
});
