import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '@wholo/types';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AccountingAccountController } from './accounting-account.controller';
import { AccountingAccountService } from './accounting-account.service';

const mockService = { listSalesAccounts: jest.fn() };

describe('AccountingAccountController', () => {
  let controller: AccountingAccountController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingAccountController],
      providers: [{ provide: AccountingAccountService, useValue: mockService }],
    }).compile();
    controller = module.get(AccountingAccountController);
  });

  it('is guarded by JWT, distributor access and permissions', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AccountingAccountController)).toEqual([
      JwtAuthGuard,
      DistributorAccessGuard,
      PermissionsGuard,
    ]);
  });

  it('listSalesAccounts requires ACCOUNTING_READ', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingAccountController.prototype.listSalesAccounts)).toEqual([
      Permission.ACCOUNTING_READ,
    ]);
  });

  it("returns the distributor's accounts", async () => {
    const accounts = [{ id: 'acct-1', code: '200', displayName: 'Sales' }];
    mockService.listSalesAccounts.mockResolvedValue(accounts);

    await expect(controller.listSalesAccounts('dist-1')).resolves.toBe(accounts);
    expect(mockService.listSalesAccounts).toHaveBeenCalledWith('dist-1');
  });
});
