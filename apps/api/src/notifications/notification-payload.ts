// Snapshot stored on Notification.payload for ORDER_PLACED — everything the
// channel senders need to render without querying back to the order.
export interface OrderPlacedNotificationPayload {
  orderId: string;
  orderNumber: string;
  distributorName: string;
  customerName: string;
  autoAccepted: boolean;
  placedByUserId: string;
}

// Snapshot stored on Notification.payload for CUSTOMER_INVITE_SENT.
export interface CustomerInviteNotificationPayload {
  invitationId: string;
  distributorName: string;
  inviteUrl: string;
}
