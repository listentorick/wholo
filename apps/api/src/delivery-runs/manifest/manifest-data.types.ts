export interface ManifestAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export interface ManifestOrderLine {
  id: string;
  productName: string;
  quantity: number;
}

export interface ManifestOrder {
  orderId: string;
  orderNumber: string;
  // Matches the Delivery Runs board/list's existing "stop = one order"
  // convention (see DeliveryRunsService.getDay's stopCount comment) — no
  // customer-grouping, so the manifest's stop numbers agree with the board's
  // for the same run.
  stopNumber: number;
  customerName: string;
  address: ManifestAddress;
  // Sourced from Order.notes — there is no dedicated delivery-instructions
  // field in the schema.
  deliveryInstructions: string | null;
  customerReference: string | null;
  lines: ManifestOrderLine[];
}

export interface ManifestData {
  runId: string;
  runName: string;
  runReference: string;
  deliveryDate: string;
  driverName: string | null;
  distributorName: string;
  orders: ManifestOrder[];
}
