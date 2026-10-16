import { SetMetadata } from '@nestjs/common';

export const OPEN_DELIVERY_ONLY_KEY = 'openDeliveryOnly';

// Marks a route whose request body must not be read unless the link points
// at a delivery that is still open. DeliveryLinkGuard asks apps/api first
// (ADR-076).
export const OpenDeliveryOnly = () => SetMetadata(OPEN_DELIVERY_ONLY_KEY, true);
