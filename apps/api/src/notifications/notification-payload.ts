// One order line, snapshotted for the distributor's new-order email — not
// re-derived from the Order model at render time, same rationale as every
// other field on OrderPlacedNotificationPayload.
export interface OrderLineSnapshot {
  productName: string;
  sku: string | null;
  quantity: number;
  lineTotal: string;
}

// Snapshot stored on Notification.payload for ORDER_PLACED — everything the
// channel senders need to render without querying back to the order.
// totalAmount/currency/requestedDeliveryDate/customerReference/lineItemCount/
// orderLines are distributor-notification content only (the customer
// templates don't reference them) — nullable because events written before
// these fields existed replay without them.
export interface OrderPlacedNotificationPayload {
  orderId: string;
  orderNumber: string;
  distributorName: string;
  distributorEmail: string | null;
  distributorPhone: string | null;
  distributorSlug: string | null;
  distributorLogoUrl: string | null;
  customerName: string;
  autoAccepted: boolean;
  placedByUserId: string;
  totalAmount: string | null;
  currency: string | null;
  requestedDeliveryDate: string | null;
  customerReference: string | null;
  lineItemCount: number | null;
  orderLines: OrderLineSnapshot[] | null;
}

// Snapshot stored on Notification.payload for CUSTOMER_INVITE_SENT.
// distributorLogoUrl is resolved at handling time (not carried on the
// outbox event) since it can change between when the invite is sent and
// when the email is actually delivered/retried.
export interface CustomerInviteNotificationPayload {
  invitationId: string;
  distributorName: string;
  distributorEmail: string | null;
  distributorPhone: string | null;
  distributorLogoUrl: string | null;
  customerName: string;
  recipientEmail: string;
  inviteUrl: string;
  expiresAt: string;
}

// Snapshot stored on Notification.payload for ORDER_DELIVERED / ORDER_DELIVERY_FAILED.
// Deliberately minimal, same shape discipline as OrderSubmittedEventPayload —
// recipients are resolved live by DeliveryOutcomeNotificationService from the
// IDs here, not carried as a snapshot (unlike distributorLogoUrl elsewhere,
// which genuinely needs to survive a retry unchanged).
export interface OrderDeliveryOutcomeEventPayload {
  orderId: string;
  distributorId: string;
  traderCustomerId: string;
  placedByUserId: string;
  isOrderedByDelegate: boolean;
  orderNumber: string;
  driverName: string | null;
  recordedAt: string;
  // Only meaningful for ORDER_DELIVERY_FAILED — null for a Delivered outcome.
  unableReason: string | null;
}

// Snapshot stored on Notification.payload for both ORDER_DELIVERED and
// ORDER_DELIVERY_FAILED — everything the channel senders need to render
// without querying back to the order.
export interface DeliveryOutcomeNotificationPayload {
  orderId: string;
  orderNumber: string;
  distributorName: string;
  distributorEmail: string | null;
  distributorPhone: string | null;
  distributorLogoUrl: string | null;
  distributorSlug: string | null;
  customerName: string;
  driverName: string | null;
  recordedAt: string;
  unableReason: string | null;
}

// Snapshot stored on Notification.payload for the five trade-relationship
// status-transition events (request accepted/declined, suspended, unsuspended,
// activated). portalUrl is null for SUSPENDED — there's nothing to browse
// while suspended. distributorLogoUrl is resolved at handling time, not
// carried on the outbox event — see notification-payload comment above.
export interface TradeRelationshipNotificationPayload {
  relationshipId: string;
  distributorName: string;
  distributorEmail: string | null;
  distributorPhone: string | null;
  distributorLogoUrl: string | null;
  portalUrl: string | null;
}
