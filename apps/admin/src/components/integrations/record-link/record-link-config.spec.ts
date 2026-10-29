import { describe, it, expect } from 'vitest';
import type { AccountingProvider, AccountingRecordLink } from '@wholo/types';
import { linkProblem, matchMethodLabel } from './record-link-config';

const connection = { provider: 'FAKE' as AccountingProvider, providerName: 'Fake Books', status: 'CONNECTED', lastSyncedAt: null } as const;
const base: AccountingRecordLink<unknown, string> = { connection, link: null, change: null, suggestion: null, history: [] };
const linked = { mappingId: 'm', matchMethod: 'MANUAL', linkedAt: '', linkedBy: null, external: {} };

describe('linkProblem', () => {
  it('is nothing without a connection or without a lookup', () => {
    expect(linkProblem(null, 'warning')).toBeNull();
    expect(linkProblem({ ...base, connection: null }, 'warning')).toBeNull();
  });

  it('is nothing for a linked record with no change', () => {
    expect(linkProblem({ ...base, link: linked }, 'warning')).toBeNull();
  });

  it('names the provider from the connection when a linked record changed', () => {
    expect(linkProblem({ ...base, link: linked, change: { detectedAt: '' } }, 'quiet')).toEqual({
      label: 'Changed in Fake Books',
      tone: 'yellow',
    });
  });

  it('flags not linked, orange when it matters and grey when it does not', () => {
    expect(linkProblem(base, 'warning')).toEqual({ label: 'Not linked', tone: 'orange' });
    expect(linkProblem(base, 'quiet')).toEqual({ label: 'Not linked', tone: 'gray' });
  });

  it('says when a match was found', () => {
    const suggestion = { id: 's', confidence: 90, matchMethod: 'SKU_EXACT', matchReason: '', external: {} };
    expect(linkProblem({ ...base, suggestion }, 'quiet')?.label).toBe('Not linked · match found');
  });
});

describe('matchMethodLabel', () => {
  it('describes known methods and returns null for unknown ones', () => {
    expect(matchMethodLabel('SKU_EXACT')).toBe('matched on SKU');
    expect(matchMethodLabel('SOMETHING_NEW')).toBeNull();
  });
});
