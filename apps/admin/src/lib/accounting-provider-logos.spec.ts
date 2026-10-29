import { describe, it, expect } from 'vitest';
import type { AccountingProvider } from '@wholo/types';
import { accountingProviderLogo } from './accounting-provider-logos';

describe('accountingProviderLogo', () => {
  it('returns the logo the integrations page uses for a known provider', () => {
    expect(accountingProviderLogo('XERO' as AccountingProvider)).toBe('/logos/xero.png');
  });

  it('returns null for a provider without a logo', () => {
    expect(accountingProviderLogo('FAKE' as AccountingProvider)).toBeNull();
  });
});
