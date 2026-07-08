import { Test, TestingModule } from '@nestjs/testing';
import { AccountingProvider } from '@prisma/client';
import { AccountingAdapterRegistry } from './accounting-adapter.registry';
import { XeroAccountingAdapter } from './xero-connection.adapter';

const mockXeroAdapter = {
  buildAuthorizationUrl: jest.fn(),
  exchangeCodeForToken: jest.fn(),
  listAvailableOrganisations: jest.fn(),
  refreshAccessToken: jest.fn(),
};

describe('AccountingAdapterRegistry', () => {
  let registry: AccountingAdapterRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingAdapterRegistry,
        { provide: XeroAccountingAdapter, useValue: mockXeroAdapter },
      ],
    }).compile();
    registry = module.get(AccountingAdapterRegistry);
  });

  it('resolves the Xero adapter for AccountingProvider.XERO', () => {
    expect(registry.get(AccountingProvider.XERO)).toBe(mockXeroAdapter);
  });

  it('throws for a provider with no registered adapter', () => {
    expect(() => registry.get('QUICKBOOKS' as AccountingProvider)).toThrow(
      /No accounting adapter registered/,
    );
  });
});
