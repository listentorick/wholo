// Queue-per-concern topology (ADR-047). BullMQ queues are work queues, not
// pub/sub topics, so fan-out is owned by the outbox publisher via EVENT_ROUTES.
export const NOTIFICATIONS_QUEUE = 'notifications';
export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';
export const XERO_SYNC_QUEUE = 'xero-sync';
export const ACCOUNTING_CONTACT_SYNC_QUEUE = 'accounting-contact-sync';
export const ACCOUNTING_PRODUCT_SYNC_QUEUE = 'accounting-product-sync';

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
  OrderSubmitted: [NOTIFICATIONS_QUEUE],
  OrderAccepted: [XERO_SYNC_QUEUE],
  AccountingContactSyncRequested: [ACCOUNTING_CONTACT_SYNC_QUEUE],
  AccountingProductSyncRequested: [ACCOUNTING_PRODUCT_SYNC_QUEUE],
};
