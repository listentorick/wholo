// Snapshot stored on Notification.payload for ORDER_PLACED — everything the
// channel senders need to render without querying back to the order.
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
