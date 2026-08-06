import { Injectable } from '@nestjs/common';
import { AccountingTaxTypeMatchMethod } from '@prisma/client';
import { AccountingMatchResult, AccountingRecordMatcher } from './accounting-record-matcher.interface';
import { similarity } from './name-similarity.util';

// The tax-rate-side fields the matcher needs — a subset of
// ExternalAccountingTaxType, not the Prisma model itself, so this stays
// testable without a DB.
export interface AccountingMatchTaxType {
  displayName: string;
}

// One Wholo tax type eligible to be matched — i.e. a TaxType not already
// mapped to any external tax rate on this connection. Callers own that
// filtering; this service only ranks the pool it's given.
export interface AccountingTaxTypeMatchCandidate {
  taxTypeId: string;
  name: string;
}

export type AccountingTaxTypeMatchResult = AccountingMatchResult<AccountingTaxTypeMatchMethod>;

// Name-only fuzzy threshold — there's no code/SKU equivalent for tax rates,
// so this is the only rule below exact/normalised matching. Same threshold
// as the product matcher's fuzzy step (0.75) — a tax type's name is short and
// standardised enough (e.g. "Standard rate", "Zero-rated") that a looser
// threshold risks conflating genuinely different rates.
const NAME_FUZZY_SIMILARITY_THRESHOLD = 0.75;
const NAME_FUZZY_MAX_CONFIDENCE = 40;
const NAME_FUZZY_MIN_CONFIDENCE = 25;

function normalizedEquals(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Strips punctuation/whitespace so e.g. "V.A.T." and "VAT" compare equal,
// without going as far as full fuzzy matching.
function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Priority-ordered candidate matching for accounting tax types. Never decides
// anything on its own — every result is a suggestion for a human to confirm,
// regardless of confidence (see AccountingTaxTypeMatchSuggestion). Pure,
// DB-free, so it's independently unit-testable. Result candidateId is the
// TaxType id.
@Injectable()
export class AccountingTaxTypeMatcherService
  implements AccountingRecordMatcher<AccountingMatchTaxType, AccountingTaxTypeMatchCandidate, AccountingTaxTypeMatchMethod>
{
  findBestMatch(
    taxType: AccountingMatchTaxType,
    candidates: AccountingTaxTypeMatchCandidate[],
  ): AccountingTaxTypeMatchResult | null {
    return (
      this.matchNameExact(taxType, candidates) ??
      this.matchNameNormalised(taxType, candidates) ??
      this.matchNameFuzzy(taxType, candidates)
    );
  }

  private matchNameExact(
    taxType: AccountingMatchTaxType,
    candidates: AccountingTaxTypeMatchCandidate[],
  ): AccountingTaxTypeMatchResult | null {
    const matches = candidates.filter((c) => normalizedEquals(c.name, taxType.displayName));
    // Ambiguity means no suggestion from this rule at all (not "pick one") —
    // same rule as the product/contact matchers.
    if (matches.length !== 1) return null;

    return {
      candidateId: matches[0].taxTypeId,
      confidence: 90,
      matchMethod: AccountingTaxTypeMatchMethod.NAME_EXACT,
      matchReason: `Tax rate name "${taxType.displayName}" matches the tax type name exactly`,
    };
  }

  private matchNameNormalised(
    taxType: AccountingMatchTaxType,
    candidates: AccountingTaxTypeMatchCandidate[],
  ): AccountingTaxTypeMatchResult | null {
    const normalisedName = normalizeName(taxType.displayName);
    if (!normalisedName) return null;

    const matches = candidates.filter((c) => normalizeName(c.name) === normalisedName);
    if (matches.length !== 1) return null;

    return {
      candidateId: matches[0].taxTypeId,
      confidence: 75,
      matchMethod: AccountingTaxTypeMatchMethod.NAME_NORMALISED,
      matchReason: `Tax rate name "${taxType.displayName}" matches "${matches[0].name}" ignoring case and punctuation`,
    };
  }

  private matchNameFuzzy(
    taxType: AccountingMatchTaxType,
    candidates: AccountingTaxTypeMatchCandidate[],
  ): AccountingTaxTypeMatchResult | null {
    let best: { candidate: AccountingTaxTypeMatchCandidate; sim: number } | null = null;
    for (const candidate of candidates) {
      const sim = similarity(taxType.displayName, candidate.name);
      if (sim >= NAME_FUZZY_SIMILARITY_THRESHOLD && (!best || sim > best.sim)) {
        best = { candidate, sim };
      }
    }
    if (!best) return null;

    const confidence = Math.max(
      NAME_FUZZY_MIN_CONFIDENCE,
      Math.round(NAME_FUZZY_MAX_CONFIDENCE * best.sim),
    );

    return {
      candidateId: best.candidate.taxTypeId,
      confidence,
      matchMethod: AccountingTaxTypeMatchMethod.NAME_FUZZY,
      matchReason: `Name is ${Math.round(best.sim * 100)}% similar to "${best.candidate.name}"`,
    };
  }
}
