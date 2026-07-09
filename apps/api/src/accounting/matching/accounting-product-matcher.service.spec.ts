import { AccountingProductMatchMethod } from '@prisma/client';
import {
  AccountingMatchProduct,
  AccountingProductMatchCandidate,
  AccountingProductMatcherService,
} from './accounting-product-matcher.service';

function candidate(overrides: Partial<AccountingProductMatchCandidate> = {}): AccountingProductMatchCandidate {
  return {
    productId: 'prod-1',
    sku: null,
    name: 'Cabernet Sauvignon 2023',
    ...overrides,
  };
}

function product(overrides: Partial<AccountingMatchProduct> = {}): AccountingMatchProduct {
  return {
    externalProductCode: null,
    displayName: 'Cabernet Sauvignon 2023',
    ...overrides,
  };
}

describe('AccountingProductMatcherService', () => {
  let matcher: AccountingProductMatcherService;

  beforeEach(() => {
    matcher = new AccountingProductMatcherService();
  });

  it('returns null when there are no candidates', () => {
    expect(matcher.findBestMatch(product(), [])).toBeNull();
  });

  it('returns null when nothing clears any threshold', () => {
    const result = matcher.findBestMatch(
      product({ displayName: 'Zzz Totally Unrelated Item' }),
      [candidate({ name: 'Cabernet Sauvignon 2023' })],
    );
    expect(result).toBeNull();
  });

  describe('SKU_EXACT (confidence 95)', () => {
    it('matches the item code against the product SKU exactly', () => {
      const result = matcher.findBestMatch(
        product({ externalProductCode: 'CAB-SAUV-001' }),
        [candidate({ productId: 'prod-9', sku: 'CAB-SAUV-001', name: 'Completely Different Name' })],
      );
      expect(result).toMatchObject({
        candidateId: 'prod-9',
        confidence: 95,
        matchMethod: AccountingProductMatchMethod.SKU_EXACT,
      });
    });

    it('is case-sensitive — a case difference falls through to SKU_NORMALISED', () => {
      const result = matcher.findBestMatch(
        product({ externalProductCode: 'cab-sauv-001' }),
        [candidate({ productId: 'prod-9', sku: 'CAB-SAUV-001', name: 'Different Name' })],
      );
      expect(result?.matchMethod).toBe(AccountingProductMatchMethod.SKU_NORMALISED);
    });

    it('returns no SKU match when two candidates share the same SKU (ambiguous)', () => {
      const result = matcher.findBestMatch(
        product({ externalProductCode: 'CAB-SAUV-001', displayName: 'Zzz Unrelated' }),
        [
          candidate({ productId: 'prod-a', sku: 'CAB-SAUV-001', name: 'First Product' }),
          candidate({ productId: 'prod-b', sku: 'CAB-SAUV-001', name: 'Second Product' }),
        ],
      );
      expect(result).toBeNull();
    });

    it('takes priority over name rules', () => {
      const result = matcher.findBestMatch(
        product({ externalProductCode: 'CAB-SAUV-001', displayName: 'Cabernet Sauvignon 2023' }),
        [
          candidate({ productId: 'prod-name', sku: null, name: 'Cabernet Sauvignon 2023' }),
          candidate({ productId: 'prod-sku', sku: 'CAB-SAUV-001', name: 'Something Else' }),
        ],
      );
      expect(result?.candidateId).toBe('prod-sku');
      expect(result?.matchMethod).toBe(AccountingProductMatchMethod.SKU_EXACT);
    });
  });

  describe('SKU_NORMALISED (confidence 75)', () => {
    it('matches ignoring case, whitespace, dashes and underscores', () => {
      const result = matcher.findBestMatch(
        product({ externalProductCode: 'CAB SAUV 001', displayName: 'Different Name' }),
        [candidate({ productId: 'prod-norm', sku: 'cab-sauv-001', name: 'Also Different' })],
      );
      expect(result).toMatchObject({
        candidateId: 'prod-norm',
        confidence: 75,
        matchMethod: AccountingProductMatchMethod.SKU_NORMALISED,
      });
    });

    it('does NOT bridge genuinely different codes (CAB-SAUV-001 vs CAB-SAV-001)', () => {
      const result = matcher.findBestMatch(
        product({ externalProductCode: 'CAB-SAUV-001', displayName: 'Zzz Unrelated' }),
        [candidate({ sku: 'CAB-SAV-001', name: 'Also Unrelated Zzz' })],
      );
      expect(result).toBeNull();
    });

    it('returns no match when normalisation makes two candidates ambiguous', () => {
      const result = matcher.findBestMatch(
        product({ externalProductCode: 'CAB-SAUV-001', displayName: 'Zzz Unrelated' }),
        [
          candidate({ productId: 'prod-a', sku: 'cab sauv 001', name: 'First' }),
          candidate({ productId: 'prod-b', sku: 'CAB_SAUV_001', name: 'Second' }),
        ],
      );
      expect(result).toBeNull();
    });
  });

  describe('NAME_EXACT (confidence 65)', () => {
    it('matches on exact name, case-insensitively', () => {
      const result = matcher.findBestMatch(
        product({ displayName: 'CABERNET SAUVIGNON 2023' }),
        [candidate({ productId: 'prod-name', name: 'Cabernet Sauvignon 2023' })],
      );
      expect(result).toMatchObject({
        candidateId: 'prod-name',
        confidence: 65,
        matchMethod: AccountingProductMatchMethod.NAME_EXACT,
      });
    });
  });

  describe('NAME_FUZZY (confidence 25-40, threshold 0.75)', () => {
    it('matches a very similar name', () => {
      const result = matcher.findBestMatch(
        product({ displayName: 'Cabernet Sauvignon 2023 Case' }),
        [candidate({ productId: 'prod-fuzzy', name: 'Cabernet Sauvignon 2023' })],
      );
      expect(result?.matchMethod).toBe(AccountingProductMatchMethod.NAME_FUZZY);
      expect(result?.confidence).toBeGreaterThanOrEqual(25);
      expect(result?.confidence).toBeLessThanOrEqual(40);
    });

    it('is stricter than contact fuzzy matching — a moderate similarity is rejected', () => {
      // "Blackbird Vine and Company" vs "Blackbird Vine & Co" clears the
      // contacts threshold (0.6) but must not clear the products one (0.75).
      const result = matcher.findBestMatch(
        product({ displayName: 'Blackbird Vine and Company' }),
        [candidate({ name: 'Blackbird V. & Co' })],
      );
      expect(result).toBeNull();
    });

    it('picks the highest-similarity candidate among several', () => {
      const result = matcher.findBestMatch(
        product({ displayName: 'Cabernet Sauvignon 2023' }),
        [
          candidate({ productId: 'prod-loose', name: 'Cabernet Sauvignon Magnum 2023' }),
          candidate({ productId: 'prod-close', name: 'Cabernet Sauvignon 2023' }),
        ],
      );
      expect(result?.candidateId).toBe('prod-close');
    });
  });

  it('never matches on price or quantity signals (only code and name exist as inputs)', () => {
    // Structural: the matcher's input type has no price/quantity fields.
    // This test pins the behaviour that an unrelated code+name yields null
    // no matter what other cache columns hold.
    const result = matcher.findBestMatch(
      product({ externalProductCode: 'AAA-1', displayName: 'Aaa Product' }),
      [candidate({ sku: 'BBB-2', name: 'Zzz Something Else' })],
    );
    expect(result).toBeNull();
  });
});
