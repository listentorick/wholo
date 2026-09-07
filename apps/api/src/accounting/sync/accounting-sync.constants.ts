// The one place accounting is bound to the generic ingestion-run machinery.
// sourceType is fixed; sourceRef is the AccountingConnection id; each resource
// type maps to the existing Accounting*SyncRequested outbox event (the
// schedulers still emit those, so the EVENT_ROUTES entries stay).
export const ACCOUNTING_SOURCE_TYPE = 'accounting';

export const ACCOUNTING_SYNC_RESOURCE_TYPES = ['contact', 'product', 'tax_type'] as const;
export type AccountingSyncResourceType = (typeof ACCOUNTING_SYNC_RESOURCE_TYPES)[number];

export const ACCOUNTING_SYNC_EVENT_TYPE: Record<AccountingSyncResourceType, string> = {
  contact: 'AccountingContactSyncRequested',
  product: 'AccountingProductSyncRequested',
  tax_type: 'AccountingTaxTypeSyncRequested',
};
