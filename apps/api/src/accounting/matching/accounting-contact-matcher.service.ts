import { Injectable } from '@nestjs/common';
import { AccountingContactMatchMethod } from '@prisma/client';
import { similarity } from './name-similarity.util';

// The contact-side fields the matcher needs — deliberately a subset of
// ExternalAccountingContact, not the Prisma model itself, so this stays
// testable without a DB.
export interface AccountingMatchContact {
  externalContactCode?: string | null;
  externalAccountNumber?: string | null;
  displayName: string;
  email?: string | null;
  billingPostcode?: string | null;
}

// One Wholo customer eligible to be matched — i.e. a TradeRelationship (+ its
// Organisation) not already mapped to any contact on this connection. Callers
// own that filtering; this service only ranks the pool it's given.
export interface AccountingMatchCandidate {
  tradeRelationshipId: string;
  accountNumber?: string | null;
  organisationName: string;
  organisationEmail?: string | null;
  organisationPostcode?: string | null;
}

export interface AccountingMatchResult {
  tradeRelationshipId: string;
  confidence: number;
  matchMethod: AccountingContactMatchMethod;
  matchReason: string;
}

const NAME_POSTCODE_SIMILARITY_THRESHOLD = 0.85;
const NAME_FUZZY_SIMILARITY_THRESHOLD = 0.6;
const NAME_FUZZY_MAX_CONFIDENCE = 40;
const NAME_FUZZY_MIN_CONFIDENCE = 25;

function normalizedEquals(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Priority-ordered candidate matching. Never decides anything on its own —
// every result is a suggestion for a human to confirm, regardless of
// confidence (see AccountingContactMatchSuggestion). Pure, DB-free, so it's
// independently unit-testable.
@Injectable()
export class AccountingContactMatcherService {
  findBestMatch(
    contact: AccountingMatchContact,
    candidates: AccountingMatchCandidate[],
  ): AccountingMatchResult | null {
    return (
      this.matchAccountCode(contact, candidates) ??
      this.matchEmail(contact, candidates) ??
      this.matchNameExact(contact, candidates) ??
      this.matchNamePostcode(contact, candidates) ??
      this.matchNameFuzzy(contact, candidates)
    );
  }

  private matchAccountCode(
    contact: AccountingMatchContact,
    candidates: AccountingMatchCandidate[],
  ): AccountingMatchResult | null {
    const codes = [contact.externalContactCode, contact.externalAccountNumber]
      .map((code) => code?.trim())
      .filter((code): code is string => !!code);
    if (codes.length === 0) return null;

    const candidate = candidates.find((c) => {
      const accountNumber = c.accountNumber?.trim();
      return !!accountNumber && codes.includes(accountNumber);
    });
    if (!candidate) return null;

    return {
      tradeRelationshipId: candidate.tradeRelationshipId,
      confidence: 95,
      matchMethod: AccountingContactMatchMethod.ACCOUNT_CODE_EXACT,
      matchReason: `Account number ${candidate.accountNumber} matches the customer's account number`,
    };
  }

  private matchEmail(
    contact: AccountingMatchContact,
    candidates: AccountingMatchCandidate[],
  ): AccountingMatchResult | null {
    if (!contact.email) return null;

    const candidate = candidates.find((c) => normalizedEquals(c.organisationEmail, contact.email));
    if (!candidate) return null;

    return {
      tradeRelationshipId: candidate.tradeRelationshipId,
      confidence: 80,
      matchMethod: AccountingContactMatchMethod.EMAIL_EXACT,
      matchReason: `Billing email ${contact.email} matches the customer's email exactly`,
    };
  }

  private matchNameExact(
    contact: AccountingMatchContact,
    candidates: AccountingMatchCandidate[],
  ): AccountingMatchResult | null {
    const candidate = candidates.find((c) => normalizedEquals(c.organisationName, contact.displayName));
    if (!candidate) return null;

    return {
      tradeRelationshipId: candidate.tradeRelationshipId,
      confidence: 70,
      matchMethod: AccountingContactMatchMethod.NAME_EXACT,
      matchReason: `Contact name "${contact.displayName}" matches the customer name exactly`,
    };
  }

  private matchNamePostcode(
    contact: AccountingMatchContact,
    candidates: AccountingMatchCandidate[],
  ): AccountingMatchResult | null {
    if (!contact.billingPostcode) return null;

    let best: { candidate: AccountingMatchCandidate; sim: number } | null = null;
    for (const candidate of candidates) {
      if (!normalizedEquals(candidate.organisationPostcode, contact.billingPostcode)) continue;
      const sim = similarity(contact.displayName, candidate.organisationName);
      if (sim >= NAME_POSTCODE_SIMILARITY_THRESHOLD && (!best || sim > best.sim)) {
        best = { candidate, sim };
      }
    }
    if (!best) return null;

    return {
      tradeRelationshipId: best.candidate.tradeRelationshipId,
      confidence: 60,
      matchMethod: AccountingContactMatchMethod.NAME_POSTCODE,
      matchReason: `Similar name and matching postcode (${contact.billingPostcode})`,
    };
  }

  private matchNameFuzzy(
    contact: AccountingMatchContact,
    candidates: AccountingMatchCandidate[],
  ): AccountingMatchResult | null {
    let best: { candidate: AccountingMatchCandidate; sim: number } | null = null;
    for (const candidate of candidates) {
      const sim = similarity(contact.displayName, candidate.organisationName);
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
      tradeRelationshipId: best.candidate.tradeRelationshipId,
      confidence,
      matchMethod: AccountingContactMatchMethod.NAME_FUZZY,
      matchReason: `Name is ${Math.round(best.sim * 100)}% similar to "${best.candidate.organisationName}"`,
    };
  }
}
