import { SetMetadata } from '@nestjs/common';

export const OPEN_DELIVERY_ONLY_KEY = 'openDeliveryOnly';

// Marks a delivery-link route that changes the delivery. DeliveryLinkGuard
// refuses it with 410 once an outcome is recorded — before the request body
// is read, so an upload to a completed delivery is never parsed (ADR-076).
export const OpenDeliveryOnly = () => SetMetadata(OPEN_DELIVERY_ONLY_KEY, true);
