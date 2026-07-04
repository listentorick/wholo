// Queue-per-concern topology (ADR-047). BullMQ queues are work queues, not
// pub/sub topics, so fan-out is owned by the outbox publisher via EVENT_ROUTES.
export const NOTIFICATIONS_QUEUE = 'notifications';
export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';
export const XERO_SYNC_QUEUE = 'xero-sync';

// Domain event type → queues whose consumers care about it.
// Activation rule (ADR-047): a route entry ships in the same PR as its
// processor and inbox table — never earlier, or jobs accumulate unconsumed.
// Events with no route are marked PUBLISHED without enqueueing anything.
export const EVENT_ROUTES: Record<string, string[]> = {
  OrderSubmitted: [NOTIFICATIONS_QUEUE],
  OrderAccepted: [XERO_SYNC_QUEUE],
};
