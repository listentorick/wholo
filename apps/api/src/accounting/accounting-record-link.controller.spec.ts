import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '@wholo/types';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AccountingRecordLinkController } from './accounting-record-link.controller';
import { AccountingRecordLinkService } from './accounting-record-link.service';

const mockService = {
  getCustomerLink: jest.fn(),
  getProductLink: jest.fn(),
};

describe('AccountingRecordLinkController', () => {
  let controller: AccountingRecordLinkController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingRecordLinkController],
      providers: [{ provide: AccountingRecordLinkService, useValue: mockService }],
    }).compile();
    controller = module.get(AccountingRecordLinkController);
  });

  it('is guarded by JWT, distributor access and permissions', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AccountingRecordLinkController)).toEqual([
      JwtAuthGuard,
      DistributorAccessGuard,
      PermissionsGuard,
    ]);
  });

  it.each(['getCustomerLink', 'getProductLink'] as const)('%s requires ACCOUNTING_READ', (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingRecordLinkController.prototype[method])).toEqual([
      Permission.ACCOUNTING_READ,
    ]);
  });

  it('getCustomerLink returns the service result', async () => {
    mockService.getCustomerLink.mockResolvedValue({ connection: null });
    expect(await controller.getCustomerLink('dist-1', 'cust-1')).toEqual({ connection: null });
    expect(mockService.getCustomerLink).toHaveBeenCalledWith('dist-1', 'cust-1');
  });

  it('getProductLink returns the service result', async () => {
    mockService.getProductLink.mockResolvedValue({ connection: null });
    expect(await controller.getProductLink('dist-1', 'prod-1')).toEqual({ connection: null });
    expect(mockService.getProductLink).toHaveBeenCalledWith('dist-1', 'prod-1');
  });
});
