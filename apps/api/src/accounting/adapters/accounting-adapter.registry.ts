import { Injectable } from '@nestjs/common';
import { AccountingProvider } from '@prisma/client';
import { AccountingConnectionAdapter } from './accounting-connection-adapter.interface';
import { XeroAccountingAdapter } from './xero-connection.adapter';

// Provider → adapter. The framework resolves every adapter here and never
// names a provider itself. Adding a provider: implement the port, register it
// here (see the checklist in accounting-connection-adapter.interface.ts).
@Injectable()
export class AccountingAdapterRegistry {
  private readonly adapters = new Map<AccountingProvider, AccountingConnectionAdapter>();

  constructor(xeroAdapter: XeroAccountingAdapter) {
    this.adapters.set(AccountingProvider.XERO, xeroAdapter);
  }

  get(provider: AccountingProvider): AccountingConnectionAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No accounting adapter registered for provider ${provider}`);
    }
    return adapter;
  }

  // The provider's name for user-facing text ("Xero", not "XERO").
  displayName(provider: AccountingProvider): string {
    return this.get(provider).displayName;
  }
}
