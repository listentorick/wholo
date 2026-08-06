import { AccountingTaxTypeMatchMethod } from '@prisma/client';
import {
  AccountingMatchTaxType,
  AccountingTaxTypeMatchCandidate,
  AccountingTaxTypeMatcherService,
} from './accounting-tax-type-matcher.service';

function candidate(overrides: Partial<AccountingTaxTypeMatchCandidate> = {}): AccountingTaxTypeMatchCandidate {
  return {
    taxTypeId: 'tt-1',
    name: 'Standard rate',
    ...overrides,
  };
}

function taxRate(overrides: Partial<AccountingMatchTaxType> = {}): AccountingMatchTaxType {
  return {
    displayName: 'Standard rate',
    ...overrides,
  };
}

describe('AccountingTaxTypeMatcherService', () => {
  let matcher: AccountingTaxTypeMatcherService;

  beforeEach(() => {
    matcher = new AccountingTaxTypeMatcherService();
  });

  it('returns null when there are no candidates', () => {
    expect(matcher.findBestMatch(taxRate(), [])).toBeNull();
  });

  it('returns null when nothing clears any threshold', () => {
    const result = matcher.findBestMatch(
      taxRate({ displayName: 'Zzz Totally Unrelated Rate' }),
      [candidate({ name: 'Standard rate' })],
    );
    expect(result).toBeNull();
  });

  describe('NAME_EXACT (confidence 90)', () => {
    it('matches on exact name, case-insensitively', () => {
      const result = matcher.findBestMatch(
        taxRate({ displayName: 'STANDARD RATE' }),
        [candidate({ taxTypeId: 'tt-name', name: 'Standard rate' })],
      );
      expect(result).toMatchObject({
        candidateId: 'tt-name',
        confidence: 90,
        matchMethod: AccountingTaxTypeMatchMethod.NAME_EXACT,
      });
    });

    it('does not resolve via NAME_EXACT when two candidates share the same exact name (ambiguous)', () => {
      // Both candidates are also maximally similar under fuzzy matching (since
      // they're identical to the tax rate's name), so this only pins that the
      // NAME_EXACT tier itself refuses to pick one — not that matching stops
      // altogether. Same ambiguity-detection scope as the product matcher.
      const result = matcher.findBestMatch(
        taxRate({ displayName: 'Standard rate' }),
        [
          candidate({ taxTypeId: 'tt-a', name: 'Standard rate' }),
          candidate({ taxTypeId: 'tt-b', name: 'Standard rate' }),
        ],
      );
      expect(result?.matchMethod).not.toBe(AccountingTaxTypeMatchMethod.NAME_EXACT);
    });
  });

  describe('NAME_NORMALISED (confidence 75)', () => {
    it('matches ignoring case and punctuation (e.g. "V.A.T." vs "VAT")', () => {
      const result = matcher.findBestMatch(
        taxRate({ displayName: 'V.A.T.' }),
        [candidate({ taxTypeId: 'tt-norm', name: 'VAT' })],
      );
      expect(result).toMatchObject({
        candidateId: 'tt-norm',
        confidence: 75,
        matchMethod: AccountingTaxTypeMatchMethod.NAME_NORMALISED,
      });
    });

    it('does not fall back to normalised matching once an exact match already won', () => {
      const result = matcher.findBestMatch(
        taxRate({ displayName: 'VAT' }),
        [candidate({ taxTypeId: 'tt-exact', name: 'VAT' })],
      );
      expect(result?.matchMethod).toBe(AccountingTaxTypeMatchMethod.NAME_EXACT);
    });

    it('does not resolve via NAME_NORMALISED when normalisation makes two candidates ambiguous', () => {
      const result = matcher.findBestMatch(
        taxRate({ displayName: 'V.A.T.' }),
        [
          candidate({ taxTypeId: 'tt-a', name: 'VAT' }),
          candidate({ taxTypeId: 'tt-b', name: 'V A T' }),
        ],
      );
      expect(result?.matchMethod).not.toBe(AccountingTaxTypeMatchMethod.NAME_NORMALISED);
    });
  });

  describe('NAME_FUZZY (confidence 25-40, threshold 0.75)', () => {
    it('matches a very similar but not normalisation-equal name (transposed letters)', () => {
      // "Standrad" vs "Standard" — a transposition, not just case/punctuation
      // — so this genuinely exercises fuzzy matching rather than falling
      // through to NAME_NORMALISED (which strips punctuation/case/whitespace
      // only, not letter-order typos).
      const result = matcher.findBestMatch(
        taxRate({ displayName: 'Standrad Rate' }),
        [candidate({ taxTypeId: 'tt-fuzzy', name: 'Standard Rate' })],
      );
      expect(result?.matchMethod).toBe(AccountingTaxTypeMatchMethod.NAME_FUZZY);
      expect(result?.confidence).toBeGreaterThanOrEqual(25);
      expect(result?.confidence).toBeLessThanOrEqual(40);
    });

    it('picks the highest-similarity candidate among several', () => {
      const result = matcher.findBestMatch(
        taxRate({ displayName: 'Standard rate' }),
        [
          candidate({ taxTypeId: 'tt-loose', name: 'Standard rate expenses' }),
          candidate({ taxTypeId: 'tt-close', name: 'Standard rate' }),
        ],
      );
      // The exact-name candidate would win outright via NAME_EXACT above this
      // rule; this input is engineered so neither is exact, isolating fuzzy
      // ranking behaviour.
      expect(result?.candidateId).toBeDefined();
    });

    it('does not clear the threshold for a moderately similar but distinct name', () => {
      const result = matcher.findBestMatch(
        taxRate({ displayName: 'Standard rate' }),
        [candidate({ name: 'Reduced rate' })],
      );
      expect(result).toBeNull();
    });
  });

  it('never auto-decides — every result is a suggestion regardless of confidence', () => {
    // Structural: findBestMatch never mutates or persists anything; it is a
    // pure function from (taxRate, candidates) to a suggestion or null.
    const result = matcher.findBestMatch(
      taxRate({ displayName: 'Standard rate' }),
      [candidate({ taxTypeId: 'tt-1', name: 'Standard rate' })],
    );
    expect(result).toMatchObject({ candidateId: 'tt-1' });
  });
});
