import { Test, TestingModule } from '@nestjs/testing';
import { AccountingInvoiceExportController } from './accounting-invoice-export.controller';
import { AccountingInvoiceExportService } from './accounting-invoice-export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';

const mockService = { retryExport: jest.fn() };

describe('AccountingInvoiceExportController', () => {
  let controller: AccountingInvoiceExportController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingInvoiceExportController],
      providers: [{ provide: AccountingInvoiceExportService, useValue: mockService }],
    }).compile();
    controller = module.get(AccountingInvoiceExportController);
  });

  it('is protected by the JWT and distributor-access guards', () => {
    const guards = Reflect.getMetadata('__guards__', AccountingInvoiceExportController);
    expect(guards).toEqual([JwtAuthGuard, DistributorAccessGuard]);
  });

  it('retry forwards the path ids and requesting user to the service', async () => {
    mockService.retryExport.mockResolvedValue({ status: 'requested' });

    const result = await controller.retry('dist-1', 'export-1', { user: { sub: 'user-1' } } as any);

    expect(mockService.retryExport).toHaveBeenCalledWith('dist-1', 'export-1', 'user-1');
    expect(result).toEqual({ status: 'requested' });
  });
});
