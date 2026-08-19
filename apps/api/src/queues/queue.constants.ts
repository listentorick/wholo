// Queue-per-concern topology (ADR-047). BullMQ queues are work queues, not
// pub/sub topics, so fan-out is owned by the outbox publisher via EVENT_ROUTES.
export const NOTIFICATIONS_QUEUE = 'notifications';
export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';
export const ACCOUNTING_INVOICE_EXPORT_QUEUE = 'accounting-invoice-export';
export const ACCOUNTING_CONTACT_SYNC_QUEUE = 'accounting-contact-sync';
export const ACCOUNTING_PRODUCT_SYNC_QUEUE = 'accounting-product-sync';
export const ACCOUNTING_TAX_TYPE_SYNC_QUEUE = 'accounting-tax-type-sync';
export const ANALYTICS_FACTS_QUEUE = 'analytics-facts';
export const ACCOUNTING_BULK_IMPORT_QUEUE = 'accounting-bulk-import';
export const DELIVERY_RUN_ALLOCATION_QUEUE = 'delivery-run-allocation';

// Domain event type → queues whose consumers care about it.
// Activation rule (ADR-047): a route entry ships in the same PR as its
// processor and inbox table — never earlier, or jobs accumulate unconsumed.
// Events with no route are marked PUBLISHED without enqueueing anything.
//
// The Accounting*SyncRequested events are not tied to a domain-state change —
// they're "please sync" requests, written by both a scheduled sweep and an
// explicit "sync now" click. Both go through the outbox uniformly rather than
// the scheduler shortcutting straight to the queue: an OutboxEvent's guarantee
// (processed even if the queue is briefly unavailable) applies equally to a
// scheduled trigger and a manual one — there's no reason one gets it and the
// other doesn't. jobId = outbox event id gives idempotent dedup for free, so
// there's no separate inbox table for these routes.
export const EVENT_ROUTES: Record<string, string[]> = {
  OrderSubmitted: [NOTIFICATIONS_QUEUE, ANALYTICS_FACTS_QUEUE],
  CustomerInviteSent: [NOTIFICATIONS_QUEUE],
  TradeRelationshipRequestAccepted: [NOTIFICATIONS_QUEUE],
  TradeRelationshipRequestDeclined: [NOTIFICATIONS_QUEUE],
  TradeRelationshipSuspended: [NOTIFICATIONS_QUEUE],
  TradeRelationshipUnsuspended: [NOTIFICATIONS_QUEUE],
  TradeRelationshipActivated: [NOTIFICATIONS_QUEUE],
  OrderAccepted: [ACCOUNTING_INVOICE_EXPORT_QUEUE, ANALYTICS_FACTS_QUEUE, DELIVERY_RUN_ALLOCATION_QUEUE],
  OrderRejected: [ANALYTICS_FACTS_QUEUE],
  OrderCancelled: [ANALYTICS_FACTS_QUEUE],
  // Manual "retry export" — same uniform-outbox rationale as the sync events;
  // business idempotency lives in the AccountingInvoiceExport row, so a
  // deliberate retry (new outbox event id = new jobId) is never deduped away.
  AccountingInvoiceExportRequested: [ACCOUNTING_INVOICE_EXPORT_QUEUE],
  AccountingContactSyncRequested: [ACCOUNTING_CONTACT_SYNC_QUEUE],
  AccountingProductSyncRequested: [ACCOUNTING_PRODUCT_SYNC_QUEUE],
  AccountingTaxTypeSyncRequested: [ACCOUNTING_TAX_TYPE_SYNC_QUEUE],
  AccountingBulkImportRequested: [ACCOUNTING_BULK_IMPORT_QUEUE],
};
