import { DeliveryOutcomeType } from '@prisma/client';
import { ManifestAddress } from '../delivery-runs/manifest/manifest-data.types';

export interface DeliveryLinkOrderLine {
  productName: string;
  quantity: number;
}

// Deliberately minimal — never includes pricing, and the SUBMITTED variant
// never includes address/contact/product detail (PRD §8/§13).
export interface DeliveryLinkOrderDto {
  orderNumber: string;
  distributorName: string;
  customerName: string;
  address: ManifestAddress;
  customerPhone: string | null;
  deliveryInstructions: string | null;
  lines: DeliveryLinkOrderLine[];
  state: 'PENDING' | 'SUBMITTED';
  outcome?: {
    outcome: DeliveryOutcomeType;
    recordedAt: string;
    driverName: string | null;
  };
}
