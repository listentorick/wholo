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

// How often each resource type is pulled on schedule (ADR-061 "Scheduling").
// Tax rates change rarely, so they sync far less often; a manual "Sync" still
// pulls everything immediately.
const MINUTE_MS = 60 * 1000;
export const ACCOUNTING_SYNC_INTERVAL_MS: Record<AccountingSyncResourceType, number> = {
  contact: 30 * MINUTE_MS,
  product: 30 * MINUTE_MS,
  tax_type: 6 * 60 * MINUTE_MS,
};

// Incremental pulls can't see deletions or re-offer matches for records that
// haven't changed, so a scheduled run falls back to a full pull at least this
// often (and every manual Sync is full).
export const ACCOUNTING_FULL_SYNC_INTERVAL_MS = 24 * 60 * MINUTE_MS;
