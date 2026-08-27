// Mirrors apps/api/src/delivery-links/delivery-link.types.ts and dto/submit-outcome.dto.ts.
// Kept as a local duplicate rather than a shared package — @wholo/types is
// not used as a cross-app DTO contract anywhere else in this repo either.

export interface DeliveryAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export interface DeliveryOrderLine {
  productName: string;
  quantity: number;
}

export type DeliveryOutcomeType = 'DELIVERED' | 'UNABLE_TO_DELIVER';

export type DeliveryDropMethod = 'HANDED_TO_PERSON' | 'LEFT_IN_SAFE_LOCATION';

// signature_pad stroke-vector proof (pad.toData()), stored verbatim in the
// `signature` jsonb column server-side — never a raster image. width/height are
// the capture-time canvas CSS pixel size, needed to replay the strokes later.
export interface SignatureStrokeData {
  format: 'signature_pad';
  version: number;
  width: number;
  height: number;
  strokes: unknown[];
}

// A delivery-proof photo already uploaded to the server for this order.
export interface DeliveryPhoto {
  id: string;
  thumbnailUrl: string;
}

// Structured device location captured once during the delivery (PRD §11).
// `unavailable` means no fix was obtained (permission refused / timeout / no API).
export type DeviceLocation =
  | { unavailable: true }
  | { unavailable?: false; latitude: number; longitude: number; accuracyM?: number; capturedAt?: string };

export type UnableToDeliverReason =
  | 'CUSTOMER_CLOSED'
  | 'CUSTOMER_REFUSED'
  | 'UNABLE_TO_ACCESS_PREMISES'
  | 'INCORRECT_ADDRESS'
  | 'OTHER';

export interface DeliveryLinkOrder {
  orderNumber: string;
  distributorName: string;
  customerName: string;
  address: DeliveryAddress;
  customerPhone: string | null;
  deliveryInstructions: string | null;
  lines: DeliveryOrderLine[];
  state: 'PENDING' | 'SUBMITTED';
  outcome?: {
    outcome: DeliveryOutcomeType;
    recordedAt: string;
    driverName: string | null;
  };
}

export interface SubmitOutcomeRequest {
  outcome: DeliveryOutcomeType;
  recipientName?: string;
  notes?: string;
  unableReason?: UnableToDeliverReason;
  unableReasonNote?: string;
  dropMethod?: DeliveryDropMethod;
  signature?: SignatureStrokeData;
  capturedAt?: string;
  photoIds?: string[];
  location?: DeviceLocation;
}

export const UNABLE_TO_DELIVER_REASONS: { value: UnableToDeliverReason; label: string }[] = [
  { value: 'CUSTOMER_CLOSED', label: 'Customer closed' },
  { value: 'CUSTOMER_REFUSED', label: 'Customer refused delivery' },
  { value: 'UNABLE_TO_ACCESS_PREMISES', label: 'Unable to access premises' },
  { value: 'INCORRECT_ADDRESS', label: 'Incorrect address' },
  { value: 'OTHER', label: 'Other' },
];
