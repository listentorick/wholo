import { adminAccountingApi } from '@wholo/admin-api-client';
import type {
  AccountingContactStatus,
  AccountingLinkedContact,
  AccountingLinkedProduct,
  AccountingProductStatus,
  AccountingRecordLink,
} from '@wholo/types';

// What differs between a customer's and a product's Integrations tab. The
// section itself (AccountingLinkSection) knows nothing about either, nor
// about any provider: every provider word comes from link.connection.
// Every action here is an existing accounting route; nothing new is written.

export interface LinkSearchResult {
  id: string;
  displayName: string;
  detail: string;
  /** The Stocdup record this provider record is already linked to, if any. */
  linkedTo: string | null;
}

export interface IdentityRow {
  label: string;
  value: string | null;
  mono?: boolean;
}

export interface RecordLinkConfig<TExternal extends { id: string; displayName: string }> {
  /** The provider's record, as the user would call it: "contact", "item". */
  externalNoun: string;
  /** What the search leaves out, for the no-results message: "Archived contacts and …". */
  searchExcludes: string;
  /** How serious "not linked" is for this record type. */
  notLinked: { message: string; tone: 'warning' | 'quiet' };
  identityRows: (external: TExternal) => IdentityRow[];
  load: (recordId: string) => Promise<AccountingRecordLink<TExternal, string>>;
  search: (query: string) => Promise<LinkSearchResult[]>;
  // `targetId` is what the match route takes: the trade relationship for a
  // customer, the product for a product. `override` resubmits after a
  // TAX_TYPE_CONFLICT; record types that can't conflict ignore it.
  match: (externalId: string, targetId: string, override: boolean) => Promise<void>;
  confirmSuggestion: (suggestionId: string, override: boolean) => Promise<void>;
  unlink: (mappingId: string) => Promise<void>;
  acknowledgeChange: (externalId: string) => Promise<void>;
}

const SEARCH_LIMIT = 10;

// Only records this record could sensibly be linked to: the same computed
// statuses the Integrations › Accounting tabs filter on. Already-linked ones
// stay in so they show as "Already linked to X" rather than vanishing.
const LINKABLE_CONTACT_STATUSES: AccountingContactStatus[] = ['READY_TO_IMPORT', 'SUGGESTED', 'CONFLICT', 'LINKED'];
const LINKABLE_PRODUCT_STATUSES: AccountingProductStatus[] = ['READY_TO_IMPORT', 'SUGGESTED', 'CONFLICT', 'LINKED'];

export const customerLinkConfig: RecordLinkConfig<AccountingLinkedContact> = {
  externalNoun: 'contact',
  searchExcludes: 'Archived contacts and contacts that aren’t customers',
  notLinked: { message: 'Invoices for this customer can’t be sent until it’s linked.', tone: 'warning' },
  identityRows: (contact) => [
    { label: 'Code', value: contact.code, mono: true },
    { label: 'Email', value: contact.email },
  ],
  load: (customerId) => adminAccountingApi.getCustomerAccountingLink(customerId),
  search: async (query) => {
    const res = await adminAccountingApi.listContacts({
      search: query,
      limit: SEARCH_LIMIT,
      status: LINKABLE_CONTACT_STATUSES,
    });
    return res.data.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      detail: [c.email, c.externalContactCode ?? c.externalAccountNumber].filter(Boolean).join(' · '),
      linkedTo: c.mapping?.customerName ?? null,
    }));
  },
  match: (externalId, tradeRelationshipId) => adminAccountingApi.matchContact(externalId, { tradeRelationshipId }),
  confirmSuggestion: (suggestionId) => adminAccountingApi.confirmSuggestion(suggestionId),
  unlink: (mappingId) => adminAccountingApi.unlinkMapping(mappingId),
  acknowledgeChange: (externalId) => adminAccountingApi.acknowledgeContactChange(externalId),
};

export const productLinkConfig: RecordLinkConfig<AccountingLinkedProduct> = {
  externalNoun: 'item',
  searchExcludes: 'Inactive items and items that aren’t sold',
  notLinked: { message: 'Invoices still go out — lines for this product use its description.', tone: 'quiet' },
  identityRows: (item) => [
    { label: 'Code', value: item.code, mono: true },
    { label: 'Sale price', value: item.salesUnitPrice },
    { label: 'Tax code', value: item.taxName ?? item.taxCode },
  ],
  load: (productId) => adminAccountingApi.getProductAccountingLink(productId),
  search: async (query) => {
    const res = await adminAccountingApi.listProducts({
      search: query,
      limit: SEARCH_LIMIT,
      status: LINKABLE_PRODUCT_STATUSES,
    });
    return res.data.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      detail: p.externalProductCode ?? '',
      linkedTo: p.mapping?.productName ?? null,
    }));
  },
  match: (externalId, productId, override) =>
    adminAccountingApi.matchProduct(externalId, { productId, confirmTaxTypeOverride: override }),
  confirmSuggestion: (suggestionId, override) =>
    adminAccountingApi.confirmProductSuggestion(suggestionId, { confirmTaxTypeOverride: override }),
  unlink: (mappingId) => adminAccountingApi.unlinkProductMapping(mappingId),
  acknowledgeChange: (externalId) => adminAccountingApi.acknowledgeProductChange(externalId),
};

// How a link was made, in words. Unknown methods (a future matcher) fall back
// to no explanation rather than a raw enum.
const MATCH_METHOD_LABELS: Record<string, string> = {
  ACCOUNT_CODE_EXACT: 'matched on account code',
  EMAIL_EXACT: 'matched on email',
  NAME_EXACT: 'matched on name',
  NAME_POSTCODE: 'matched on name and postcode',
  NAME_FUZZY: 'matched on a similar name',
  SKU_EXACT: 'matched on SKU',
  SKU_NORMALISED: 'matched on SKU',
  MANUAL: 'linked by hand',
};

export function matchMethodLabel(method: string): string | null {
  return MATCH_METHOD_LABELS[method] ?? null;
}

export type LinkProblem = { label: string; tone: 'yellow' | 'orange' | 'gray' } | null;

// The one thing worth flagging next to the record's name, if anything.
export function linkProblem(
  link: AccountingRecordLink<unknown, string> | null,
  notLinkedTone: 'warning' | 'quiet',
): LinkProblem {
  if (!link?.connection) return null;
  if (link.link) {
    return link.change ? { label: `Changed in ${link.connection.providerName}`, tone: 'yellow' } : null;
  }
  const tone = notLinkedTone === 'warning' ? 'orange' : 'gray';
  return { label: link.suggestion ? 'Not linked · match found' : 'Not linked', tone };
}
