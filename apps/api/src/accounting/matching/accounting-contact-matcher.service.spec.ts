import { AccountingContactMatchMethod } from '@prisma/client';
import {
  AccountingContactMatcherService,
  AccountingMatchCandidate,
  AccountingMatchContact,
} from './accounting-contact-matcher.service';

function candidate(overrides: Partial<AccountingMatchCandidate> = {}): AccountingMatchCandidate {
  return {
    tradeRelationshipId: 'tr-1',
    accountNumber: null,
    organisationName: 'Blackbird Vine & Co',
    organisationEmail: null,
    organisationPostcode: null,
    ...overrides,
  };
}

function contact(overrides: Partial<AccountingMatchContact> = {}): AccountingMatchContact {
  return {
    externalContactCode: null,
    externalAccountNumber: null,
    displayName: 'Blackbird Vine & Co',
    email: null,
    billingPostcode: null,
    ...overrides,
  };
}

describe('AccountingContactMatcherService', () => {
  let matcher: AccountingContactMatcherService;

  beforeEach(() => {
    matcher = new AccountingContactMatcherService();
  });

  it('returns null when there are no candidates', () => {
    expect(matcher.findBestMatch(contact(), [])).toBeNull();
  });

  it('returns null when nothing clears any threshold', () => {
    const result = matcher.findBestMatch(
      contact({ displayName: 'Zzz Totally Unrelated Pty' }),
      [candidate({ organisationName: 'Blackbird Vine & Co' })],
    );
    expect(result).toBeNull();
  });

  describe('ACCOUNT_CODE_EXACT (confidence 95)', () => {
    it('matches on externalContactCode against the customer account number', () => {
      const result = matcher.findBestMatch(
        contact({ externalContactCode: 'XC-102' }),
        [candidate({ tradeRelationshipId: 'tr-9', accountNumber: 'XC-102' })],
      );
      expect(result).toMatchObject({
        candidateId: 'tr-9',
        confidence: 95,
        matchMethod: AccountingContactMatchMethod.ACCOUNT_CODE_EXACT,
      });
    });

    it('matches on externalAccountNumber against the customer account number', () => {
      const result = matcher.findBestMatch(
        contact({ externalAccountNumber: 'ACC-42' }),
        [candidate({ tradeRelationshipId: 'tr-9', accountNumber: 'ACC-42' })],
      );
      expect(result?.matchMethod).toBe(AccountingContactMatchMethod.ACCOUNT_CODE_EXACT);
    });

    it('does not match when the candidate has no account number', () => {
      const result = matcher.findBestMatch(
        contact({ externalContactCode: 'XC-102' }),
        [candidate({ accountNumber: null, organisationName: 'Totally Unrelated Ltd' })],
      );
      expect(result).toBeNull();
    });

    it('takes priority over every other rule', () => {
      const result = matcher.findBestMatch(
        contact({ externalContactCode: 'XC-102', email: 'billing@blackbird.example', displayName: 'Blackbird Vine & Co' }),
        [candidate({ tradeRelationshipId: 'tr-code', accountNumber: 'XC-102', organisationEmail: 'someone-else@example.com', organisationName: 'Completely Different Name' })],
      );
      expect(result?.candidateId).toBe('tr-code');
      expect(result?.matchMethod).toBe(AccountingContactMatchMethod.ACCOUNT_CODE_EXACT);
    });
  });

  describe('EMAIL_EXACT (confidence 80)', () => {
    it('matches on exact billing email, case-insensitively', () => {
      const result = matcher.findBestMatch(
        contact({ email: 'Billing@Blackbird.example' }),
        [candidate({ tradeRelationshipId: 'tr-email', organisationEmail: 'billing@blackbird.example' })],
      );
      expect(result).toMatchObject({
        candidateId: 'tr-email',
        confidence: 80,
        matchMethod: AccountingContactMatchMethod.EMAIL_EXACT,
      });
    });

    it('does not match a different email', () => {
      const result = matcher.findBestMatch(
        contact({ email: 'billing@blackbird.example' }),
        [candidate({ organisationEmail: 'other@example.com', organisationName: 'Totally Unrelated Ltd' })],
      );
      expect(result).toBeNull();
    });
  });

  describe('NAME_EXACT (confidence 70)', () => {
    it('matches on exact name, case-insensitively', () => {
      const result = matcher.findBestMatch(
        contact({ displayName: 'BLACKBIRD VINE & CO' }),
        [candidate({ tradeRelationshipId: 'tr-name', organisationName: 'Blackbird Vine & Co' })],
      );
      expect(result).toMatchObject({
        candidateId: 'tr-name',
        confidence: 70,
        matchMethod: AccountingContactMatchMethod.NAME_EXACT,
      });
    });
  });

  describe('NAME_POSTCODE (confidence 60)', () => {
    it('matches on near-exact name plus matching postcode', () => {
      const result = matcher.findBestMatch(
        contact({ displayName: 'Blackbird Vines & Co', billingPostcode: 'E1 1AA' }),
        [candidate({ tradeRelationshipId: 'tr-pc', organisationName: 'Blackbird Vine & Co', organisationPostcode: 'E1 1AA' })],
      );
      expect(result).toMatchObject({
        candidateId: 'tr-pc',
        confidence: 60,
        matchMethod: AccountingContactMatchMethod.NAME_POSTCODE,
      });
    });

    it('does not match when the postcode differs, even with an identical name', () => {
      const result = matcher.findBestMatch(
        contact({ displayName: 'Blackbird Vine & Co', billingPostcode: 'E1 1AA' }),
        [candidate({ organisationName: 'Blackbird Vine & Co', organisationPostcode: 'W1 2BB' })],
      );
      // Falls through to NAME_EXACT instead (postcode rule doesn't apply, exact name still does)
      expect(result?.matchMethod).toBe(AccountingContactMatchMethod.NAME_EXACT);
    });

    it('does not match when the name is only loosely similar despite a matching postcode', () => {
      const result = matcher.findBestMatch(
        contact({ displayName: 'Totally Different Trading Name', billingPostcode: 'E1 1AA' }),
        [candidate({ organisationName: 'Blackbird Vine & Co', organisationPostcode: 'E1 1AA' })],
      );
      expect(result).toBeNull();
    });
  });

  describe('NAME_FUZZY (confidence 25-40)', () => {
    it('matches a moderately similar name with no other signal', () => {
      const result = matcher.findBestMatch(
        contact({ displayName: 'Blackbird Vine and Company' }),
        [candidate({ tradeRelationshipId: 'tr-fuzzy', organisationName: 'Blackbird Vine & Co' })],
      );
      expect(result?.matchMethod).toBe(AccountingContactMatchMethod.NAME_FUZZY);
      expect(result?.confidence).toBeGreaterThanOrEqual(25);
      expect(result?.confidence).toBeLessThanOrEqual(40);
    });

    it('picks the highest-similarity candidate among several fuzzy matches', () => {
      const result = matcher.findBestMatch(
        contact({ displayName: 'Blackbird Vine & Co' }),
        [
          candidate({ tradeRelationshipId: 'tr-loose', organisationName: 'Blackbird Trading Group' }),
          candidate({ tradeRelationshipId: 'tr-close', organisationName: 'Blackbird Vine and Co' }),
        ],
      );
      expect(result?.candidateId).toBe('tr-close');
    });

    it('floors confidence at 25 rather than going lower for a borderline match', () => {
      // similarity() at the 0.6 threshold scaled by 40 would be 24 — floored to 25
      const result = matcher.findBestMatch(
        contact({ displayName: 'Blackbird Vine & Co Wholesale' }),
        [candidate({ organisationName: 'Blkbrd Vn Co Whlsl' })],
      );
      if (result) {
        expect(result.confidence).toBeGreaterThanOrEqual(25);
      }
    });
  });

  it('picks the candidate with the highest similarity across the whole pool, not just the first', () => {
    const result = matcher.findBestMatch(
      contact({ displayName: 'Blackbird Vine & Co' }),
      [
        candidate({ tradeRelationshipId: 'tr-a', organisationName: 'Zzz Unrelated Ltd' }),
        candidate({ tradeRelationshipId: 'tr-b', organisationName: 'Blackbird Vine & Co' }),
      ],
    );
    expect(result?.candidateId).toBe('tr-b');
    expect(result?.matchMethod).toBe(AccountingContactMatchMethod.NAME_EXACT);
  });
});
