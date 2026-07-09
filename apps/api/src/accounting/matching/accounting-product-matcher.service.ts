import { Injectable } from '@nestjs/common';
import { AccountingProductMatchMethod } from '@prisma/client';
import { AccountingMatchResult, AccountingRecordMatcher } from './accounting-record-matcher.interface';
import { normalizeSku } from './sku-normalise.util';
import { similarity } from './name-similarity.util';

// The product-side fields the matcher needs — deliberately a subset of
// ExternalAccountingProduct, not the Prisma model itself, so this stays
// testable without a DB.
export interface AccountingMatchProduct {
  externalProductCode?: string | null;
  displayName: string;
}

// One Wholo product eligible to be matched — i.e. a Product not already
// mapped to any external product on this connection. Callers own that
// filtering; this service only ranks the pool it's given.
export interface AccountingProductMatchCandidate {
  productId: string;
  sku?: string | null;
  name: string;
}

export type AccountingProductMatchResult = AccountingMatchResult<AccountingProductMatchMethod>;

// Product matching is deliberately more conservative than contact matching:
// similar codes can be different products, sizes, vintages or pack formats
// (CAB-SAUV-001 vs CAB-SAV-001, CHARD-2023 vs CHARD-2024), so the fuzzy
// threshold is higher than the contacts' 0.6 and code rules never bridge
// character differences.
const NAME_FUZZY_SIMILARITY_THRESHOLD = 0.75;
const NAME_FUZZY_MAX_CONFIDENCE = 40;
const NAME_FUZZY_MIN_CONFIDENCE = 25;

function normalizedEquals(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Priority-ordered candidate matching for accounting products. Never decides
// anything on its own — every result is a suggestion for a human to confirm,
// regardless of confidence (see AccountingProductMatchSuggestion). Pure,
// DB-free, so it's independently unit-testable. Result candidateId is the
// Product id.
@Injectable()
export class AccountingProductMatcherService
  implements AccountingRecordMatcher<AccountingMatchProduct, AccountingProductMatchCandidate, AccountingProductMatchMethod>
{
  findBestMatch(
    product: AccountingMatchProduct,
    candidates: AccountingProductMatchCandidate[],
  ): AccountingProductMatchResult | null {
    return (
      this.matchSkuExact(product, candidates) ??
      this.matchSkuNormalised(product, candidates) ??
      this.matchNameExact(product, candidates) ??
      this.matchNameFuzzy(product, candidates)
    );
  }

  private matchSkuExact(
    product: AccountingMatchProduct,
    candidates: AccountingProductMatchCandidate[],
  ): AccountingProductMatchResult | null {
    const code = product.externalProductCode?.trim();
    if (!code) return null;

    const matches = candidates.filter((c) => c.sku?.trim() === code);
    // Ambiguity means no suggestion from this rule at all (not "pick one"):
    // two Wholo products sharing the code is a data problem a human must
    // resolve, and suggesting either would look authoritative.
    if (matches.length !== 1) return null;

    return {
      candidateId: matches[0].productId,
      confidence: 95,
      matchMethod: AccountingProductMatchMethod.SKU_EXACT,
      matchReason: `Item code ${code} matches the product SKU exactly`,
    };
  }

  private matchSkuNormalised(
    product: AccountingMatchProduct,
    candidates: AccountingProductMatchCandidate[],
  ): AccountingProductMatchResult | null {
    const code = product.externalProductCode?.trim();
    if (!code) return null;
    const normalisedCode = normalizeSku(code);
    if (!normalisedCode) return null;

    const matches = candidates.filter((c) => {
      const sku = c.sku?.trim();
      return !!sku && normalizeSku(sku) === normalisedCode;
    });
    if (matches.length !== 1) return null;

    return {
      candidateId: matches[0].productId,
      confidence: 75,
      matchMethod: AccountingProductMatchMethod.SKU_NORMALISED,
      matchReason: `Item code ${code} matches SKU ${matches[0].sku} ignoring case and separators`,
    };
  }

  private matchNameExact(
    product: AccountingMatchProduct,
    candidates: AccountingProductMatchCandidate[],
  ): AccountingProductMatchResult | null {
    const candidate = candidates.find((c) => normalizedEquals(c.name, product.displayName));
    if (!candidate) return null;

    return {
      candidateId: candidate.productId,
      confidence: 65,
      matchMethod: AccountingProductMatchMethod.NAME_EXACT,
      matchReason: `Item name "${product.displayName}" matches the product name exactly`,
    };
  }

  private matchNameFuzzy(
    product: AccountingMatchProduct,
    candidates: AccountingProductMatchCandidate[],
  ): AccountingProductMatchResult | null {
    let best: { candidate: AccountingProductMatchCandidate; sim: number } | null = null;
    for (const candidate of candidates) {
      const sim = similarity(product.displayName, candidate.name);
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
      candidateId: best.candidate.productId,
      confidence,
      matchMethod: AccountingProductMatchMethod.NAME_FUZZY,
      matchReason: `Name is ${Math.round(best.sim * 100)}% similar to "${best.candidate.name}"`,
    };
  }
}
