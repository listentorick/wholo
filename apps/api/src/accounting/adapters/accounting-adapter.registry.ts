import { Injectable } from '@nestjs/common';
import { AccountingProvider } from '@prisma/client';
import { AccountingConnectionAdapter } from './accounting-connection-adapter.interface';
import { XeroAccountingAdapter } from './xero-connection.adapter';

// Adding a second provider is: write one more adapter class, register it
// here — the service/controller never change.
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
}
