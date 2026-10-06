import { Test } from '@nestjs/testing';
import { PaymentTermsService } from './payment-terms.service';
import { ApiClientService } from '../api-client/api-client.service';

const mockApi = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };

describe('PaymentTermsService (BFF)', () => {
  let service: PaymentTermsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [PaymentTermsService, { provide: ApiClientService, useValue: mockApi }],
    }).compile();
    service = module.get(PaymentTermsService);
  });

  it('lists the caller distributor\'s terms', async () => {
    mockApi.get.mockResolvedValue({ data: [], defaultPaymentTermId: 'pt-sys' });
    await expect(service.findAll('dist-1', 'tok')).resolves.toEqual({ data: [], defaultPaymentTermId: 'pt-sys' });
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/payment-terms', 'tok');
  });

  it('gets one term', async () => {
    mockApi.get.mockResolvedValue({ id: 'pt-1' });
    await expect(service.findOne('dist-1', 'pt-1', 'tok')).resolves.toEqual({ id: 'pt-1' });
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/payment-terms/pt-1', 'tok');
  });

  it('creates a term', async () => {
    const dto = { name: 'Net 30', type: 'DAYS_AFTER_INVOICE' as const, days: 30 };
    mockApi.post.mockResolvedValue({ id: 'pt-1' });
    await expect(service.create('dist-1', dto, 'tok')).resolves.toEqual({ id: 'pt-1' });
    expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/payment-terms', 'tok', dto);
  });

  it('previews a rule', async () => {
    const dto = { type: 'DAY_OF_WEEK' as const, dayOfWeek: 5 };
    mockApi.post.mockResolvedValue({ summary: 'x', examples: [] });
    await expect(service.preview('dist-1', dto, 'tok')).resolves.toEqual({ summary: 'x', examples: [] });
    expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/payment-terms/preview', 'tok', dto);
  });

  it('updates a term', async () => {
    mockApi.patch.mockResolvedValue({ id: 'pt-1', isDefault: true });
    await expect(service.update('dist-1', 'pt-1', { isDefault: true }, 'tok')).resolves.toEqual({ id: 'pt-1', isDefault: true });
    expect(mockApi.patch).toHaveBeenCalledWith('/distributors/dist-1/payment-terms/pt-1', 'tok', { isDefault: true });
  });

  it('deactivates a term', async () => {
    mockApi.delete.mockResolvedValue({ id: 'pt-1', active: false });
    await expect(service.deactivate('dist-1', 'pt-1', 'tok')).resolves.toEqual({ id: 'pt-1', active: false });
    expect(mockApi.delete).toHaveBeenCalledWith('/distributors/dist-1/payment-terms/pt-1', 'tok');
  });
});
