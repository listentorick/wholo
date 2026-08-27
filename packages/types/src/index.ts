export * from './format-money';

export enum Role {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  DISTRIBUTOR_ADMIN = 'DISTRIBUTOR_ADMIN',
  WAREHOUSE_STAFF = 'WAREHOUSE_STAFF',
  DRIVER = 'DRIVER',
  TRADE_CUSTOMER = 'TRADE_CUSTOMER',
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organisationId: string;
  organisationName: string;
  organisationType?: 'DISTRIBUTOR' | 'TRADE_CUSTOMER';
  /** ISO 4217 currency code, only present for a DISTRIBUTOR-side membership. */
  organisationCurrencyCode?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// ─── Session / onboarding ─────────────────────────────────────────────────────

export type SessionStatus = 'ACTIVE' | 'ONBOARDING_REQUIRED' | 'ACCESS_DENIED';

/** Identity claims from Keycloak for a person who has no Wholo user yet. */
export interface SessionIdentity {
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthSession {
  status: SessionStatus;
  /** Present when status is ACTIVE or ACCESS_DENIED. */
  user?: AuthUser;
  /** Present when status is ONBOARDING_REQUIRED — prefill for the wizard. */
  identity?: SessionIdentity;
}

export interface CreateDistributorRequest {
  name: string;
  /** Portal address; omitted/blank → derived from name server-side. */
  slug?: string;
  phone?: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  addressCity: string;
  addressState?: string;
  addressPostcode: string;
  addressCountry: string;
}

export interface DistributorOrganisation {
  id: string;
  name: string;
  slug: string;
  type: 'DISTRIBUTOR';
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressPostcode?: string | null;
  addressCountry?: string | null;
  createdAt: string;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

export enum CartOrderStatus {
  DRAFT = 'DRAFT',
}

export interface CartItem {
  productId: string;
  quantity: number;
  unitPrice: string;
  taxRatePercentage: string;
  taxAmount: string;
  taxTypeName: string | null;
  product: { id: string; name: string; sku: string | null };
}

export interface CartResponse {
  orderId: string | null;
  items: CartItem[];
  subtotal: string;
  taxAmount: string;
  total: string;
  // The real tax type name when every item shares one; 'Tax' otherwise.
  taxLabel: string;
}

export interface UpsertCartItemRequest {
  distributorSlug: string;
  productId: string;
  quantity: number;
}

// ─── Commercial Orders ────────────────────────────────────────────────────────

export enum OrderStatus {
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  DELIVERED = 'DELIVERED',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
}

export enum OrderLineStatus {
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum OrderAcceptanceMode {
  MANUAL = 'MANUAL',
  AUTO_ON_SUBMISSION = 'AUTO_ON_SUBMISSION',
}

export enum AcceptanceModeSource {
  DISTRIBUTOR_DEFAULT = 'DISTRIBUTOR_DEFAULT',
  TRADER_CUSTOMER_OVERRIDE = 'TRADER_CUSTOMER_OVERRIDE',
}

export enum AcceptedByActorType {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
}

// Distinct from AcceptedByActorType (order-acceptance-specific) — the generic
// actor kind for AuditLog entries, spanning any audited entity.
export enum ActorType {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
}

export interface AddressSnapshot {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export interface OrderLine {
  id: string;
  orderId: string;
  distributorId: string;
  traderCustomerId: string;
  productId: string;
  productVariantId: string | null;
  productThumbnailUrl: string | null;
  skuSnapshot: string | null;
  productNameSnapshot: string;
  unitOfMeasureSnapshot: string | null;
  quantityOrdered: number;
  unitPriceSnapshot: string;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  taxTypeId: string | null;
  taxTypeNameSnapshot: string | null;
  taxClassificationSnapshot: TaxClassification | null;
  taxRatePercentageSnapshot: string | null;
  status: OrderLineStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  distributorId: string;
  traderCustomerId: string;
  placedByUserId: string;
  status: OrderStatus;
  currency: string;
  subtotalAmount: string;
  taxAmount: string;
  // The real tax type name when every line shares one; 'Tax' otherwise.
  taxLabel: string;
  totalAmount: string;
  billingAddressSnapshot: AddressSnapshot | null;
  deliveryAddressSnapshot: AddressSnapshot | null;
  requestedDeliveryDate: string | null;
  customerReference: string | null;
  notes: string | null;
  acceptanceModeSnapshot: OrderAcceptanceMode;
  acceptanceModeSourceSnapshot: AcceptanceModeSource;
  submittedAt: string | null;
  acceptedAt: string | null;
  acceptedByActorType: AcceptedByActorType | null;
  acceptedByUserId: string | null;
  rejectedAt: string | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  lines: OrderLine[];
  traderCustomer: { id: string; name: string } | null;
  // Latest accounting invoice export for the order (null when the distributor
  // has no accounting integration or the order predates it). Present only on
  // the admin/distributor order resource — customer-facing (portal) order
  // responses never carry it, hence optional. Types declared in the
  // Accounting Integration section below.
  invoiceExport?: OrderInvoiceExportSummary | null;
  // Customer-safe projection of the same export, available on both the
  // admin and portal order resources (unlike invoiceExport above). Omits
  // internal diagnostics (ids, error detail) that are admin-only.
  invoiceSummary?: OrderInvoiceSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderInvoiceExportSummary {
  id: string;
  provider: AccountingProvider;
  status: AccountingInvoiceExportStatus;
  externalInvoiceId: string | null;
  externalInvoiceNumber: string | null;
  externalInvoiceStatus: string | null;
  exportedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface OrderInvoiceSummary {
  status: AccountingInvoiceExportStatus;
  externalInvoiceStatus: string | null;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: string;
  totalAmount: string;
  traderCustomerName: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  requestedDeliveryDate: string | null;
  invoiceSummary?: OrderInvoiceSummary | null;
}

export interface SubmitOrderRequest {
  distributorSlug: string;
  customerReference?: string;
  notes?: string;
  requestedDeliveryDate?: string;
}

export interface AcceptOrderRequest {
  confirmUnmappedTaxTypes?: boolean;
}

export interface RejectOrderRequest {
  reason: string;
}

export interface CancelOrderRequest {
  reason: string;
}

export interface OrderListParams {
  limit?: number;
  cursor?: string;
  status?: OrderStatus;
  distributorSlug?: string;
  statusExclude?: OrderStatus;
  customerName?: string;
  deliveryDateAfter?: string;
  deliveryDateBefore?: string;
  // ACCEPTED orders with no delivery date at all — invisible on every dated
  // delivery-runs board. Wins over deliveryDateAfter/Before if both are sent.
  undated?: boolean;
  sortBy?: 'createdAt' | 'requestedDeliveryDate';
  sortOrder?: 'asc' | 'desc';
}

// Human-readable "who did what" trail entry — entityType/entityId is
// polymorphic (currently only "ORDER"), ready for future entities.
export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorType: ActorType;
  actorUserId: string | null;
  actorName: string | null;
  summary: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogQueryParams {
  limit?: number;
  cursor?: string;
}

// ─── Delivery proof of delivery ──────────────────────────────────────────────
// The recorded outcome of a driver delivery (Driver Delivery App). Captured via
// the public QR flow, surfaced read-only to distributor admins. String values
// mirror the Prisma enums in apps/api/prisma/schema.prisma exactly.

export enum DeliveryOutcomeType {
  DELIVERED = 'DELIVERED',
  UNABLE_TO_DELIVER = 'UNABLE_TO_DELIVER',
}

export enum DeliveryDropMethod {
  HANDED_TO_PERSON = 'HANDED_TO_PERSON',
  LEFT_IN_SAFE_LOCATION = 'LEFT_IN_SAFE_LOCATION',
}

export enum UnableToDeliverReason {
  CUSTOMER_CLOSED = 'CUSTOMER_CLOSED',
  CUSTOMER_REFUSED = 'CUSTOMER_REFUSED',
  UNABLE_TO_ACCESS_PREMISES = 'UNABLE_TO_ACCESS_PREMISES',
  INCORRECT_ADDRESS = 'INCORRECT_ADDRESS',
  OTHER = 'OTHER',
}

// signature_pad stroke-vector blob, stored verbatim — never a raster image.
// width/height are the capture-time canvas CSS pixel size, needed to replay the
// strokes faithfully.
export interface DeliverySignatureData {
  format: 'signature_pad';
  version: number;
  width: number;
  height: number;
  strokes: unknown[];
}

export interface DeliveryProofPhoto {
  id: string;
  // Short-lived presigned R2 URLs (private bucket). Expire ~15 min after the
  // outcome is fetched — re-fetch the outcome to refresh them.
  url: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  sortOrder: number;
}

export interface DeliveryOutcomeLocation {
  // false when the driver's device gave no fix (permission denied / timeout /
  // no API) — coords are then null.
  available: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  capturedAt: string | null;
}

export interface DeliveryOutcomeDetail {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  customerName: string;
  driverName: string | null;
  runName: string | null;
  runDeliveryDate: string | null;
  outcome: DeliveryOutcomeType;
  recipientName: string | null;
  deliveryNotes: string | null;
  unableReason: UnableToDeliverReason | null;
  unableReasonNote: string | null;
  dropMethod: DeliveryDropMethod | null;
  signature: DeliverySignatureData | null;
  // Device-reported capture time (advisory) vs authoritative server time.
  deviceCapturedAt: string | null;
  serverRecordedAt: string;
  location: DeliveryOutcomeLocation;
  submittedViaQrToken: boolean;
  correctedAt: string | null;
  correctedByName: string | null;
  photos: DeliveryProofPhoto[];
}

// ─── Products ────────────────────────────────────────────────────────────────

export enum ProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export interface ProductType {
  id: string;
  name: string;
  code: string;
  displayOrder: number;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  distributorId: string;
  name: string;
  description: string | null;
  sku: string | null;
  status: ProductStatus;
  price: string | null;
  productType: ProductType | null;
  supplier: Supplier | null;
  taxType: TaxType | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

export interface ProductListParams {
  limit?: number;
  cursor?: string;
  status?: ProductStatus[];
  productTypeId?: string[];
  supplierId?: string[];
}

// ─── Catalogue (customer-facing) ─────────────────────────────────────────────

export interface CatalogueProductType {
  id: string;
  name: string;
  code: string;
}

export interface CatalogueProduct {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: string | null;
  resolvedPrice: string | null;
  productType: CatalogueProductType | null;
  thumbnailUrl?: string | null;
}

export interface CatalogueProductDetail extends CatalogueProduct {
  imageUrl: string | null;
}

export interface CatalogueProductsParams {
  limit?: number;
  cursor?: string;
  productTypeCode?: string;
  search?: string;
}

export interface DistributorInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  bannerDominantColor: string | null;
  tagline: string | null;
  aboutText: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;
  minimumOrderSpend: number | null;
  currencyCode: string;
  customerCount: number;
}

export interface PortalDistributorSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  orderCount: number;
  minimumOrderSpend: number | null;
}

export interface CatalogueProductsResponse {
  distributor: { id: string; name: string };
  data: CatalogueProduct[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

export interface CreateProductRequest {
  name: string;
  description?: string;
  sku?: string;
  status?: ProductStatus;
  productTypeId?: string;
  supplierId?: string;
  taxTypeId?: string;
  price?: string;
}

export type UpdateProductRequest = Partial<CreateProductRequest>;

// ─── Tax Types ───────────────────────────────────────────────────────────────

export enum TaxClassification {
  STANDARD = 'STANDARD',
  REDUCED = 'REDUCED',
  ZERO_RATED = 'ZERO_RATED',
  EXEMPT = 'EXEMPT',
  OUTSIDE_SCOPE = 'OUTSIDE_SCOPE',
}

export interface TaxType {
  id: string;
  distributorId: string;
  name: string;
  classification: TaxClassification;
  ratePercentage: string;
  active: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaxTypeRequest {
  name: string;
  classification: TaxClassification;
  ratePercentage: string;
  active?: boolean;
}

export type UpdateTaxTypeRequest = Partial<CreateTaxTypeRequest>;

export interface TaxTypeListParams {
  limit?: number;
  cursor?: string;
}

// ─── Customers ───────────────────────────────────────────────────────────────

export enum TradeRelationshipStatus {
  PENDING_INVITE = 'PENDING_INVITE',
  PENDING_REQUEST = 'PENDING_REQUEST',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export interface CustomerOrganisation {
  id: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;
  billingLine1: string | null;
  billingLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostcode: string | null;
  billingCountry: string | null;
}

export interface MyProfileResponse {
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  billingLine1: string | null;
  billingLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostcode: string | null;
  billingCountry: string | null;
}

export interface MyDeliveryAddressResponse {
  deliveryAddress: AddressSnapshot | null;
}

export interface OrganisationSearchResult {
  id: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;
  isExistingCustomer: boolean;
}

export interface CustomerInvitation {
  id: string;
  email: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  organisationId: string;
  distributorId: string;
  status: TradeRelationshipStatus;
  organisation: CustomerOrganisation;
  accountNumber: string | null;
  creditLimit: string | null;
  minimumOrderSpend: string | null;
  paymentTerms: string | null;
  notes: string | null;
  recentContactSelfDeclared: boolean | null;
  deliveryLine1: string | null;
  deliveryLine2: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryPostcode: string | null;
  deliveryCountry: string | null;
  billingLine1: string | null;
  billingLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostcode: string | null;
  billingCountry: string | null;
  priceListId: string | null;
  priceList: { id: string; name: string } | null;
  deliveryProfileId: string | null;
  deliveryProfile: { id: string; name: string } | null;
  catalogues: { id: string; name: string }[];
  invitations: CustomerInvitation[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Distributor's customer record as visible to the customer principal.
 * The distributor's working data (notes, credit, pricing/catalogue wiring,
 * invitations) is filtered out by authorization at the API.
 */
export type CustomerSelfView = Omit<
  Customer,
  | 'notes'
  | 'creditLimit'
  | 'priceListId'
  | 'priceList'
  | 'deliveryProfileId'
  | 'deliveryProfile'
  | 'catalogues'
  | 'invitations'
>;

export interface CustomerListParams {
  limit?: number;
  cursor?: string;
  status?: TradeRelationshipStatus[];
  priceListId?: string[];
  deliveryProfileId?: string[];
  catalogueId?: string[];
}

export interface CreateCustomerRequest {
  organisationId?: string;
  name?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressCity?: string;
  addressState?: string;
  addressPostcode?: string;
  addressCountry?: string;
  accountNumber?: string;
  creditLimit?: string;
  minimumOrderSpend?: string;
  paymentTerms?: string;
  notes?: string;
  deliveryLine1?: string;
  deliveryLine2?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryPostcode?: string;
  deliveryCountry?: string;
  billingLine1?: string;
  billingLine2?: string;
  billingCity?: string;
  billingState?: string;
  billingPostcode?: string;
  billingCountry?: string;
}

// Status is not settable here — it moves only through the dedicated
// accept-request/decline-request/suspend/unsuspend actions on adminCustomersApi.
export type UpdateCustomerRequest = Partial<CreateCustomerRequest>;

export interface InviteResponse {
  inviteUrl: string;
  expiresAt: string;
}

// ─── Catalogues ───────────────────────────────────────────────────────────────

export interface CatalogueProductEntry {
  product: {
    id: string;
    name: string;
    sku: string | null;
    status: ProductStatus;
    price: string | null;
    productType: { id: string; name: string; code: string } | null;
  };
}

export interface Catalogue {
  id: string;
  distributorId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  products: CatalogueProductEntry[];
  _count: { customers: number };
}

export interface CatalogueSummary {
  id: string;
  name: string;
  description: string | null;
  _count: { products: number; customers: number };
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCatalogueSummary {
  id: string;
  name: string;
  description: string | null;
  _count: { products: number };
}

export interface CreateCatalogueRequest {
  name: string;
  description?: string;
  productIds?: string[];
}

export interface UpdateCatalogueRequest {
  name?: string;
  description?: string;
  productIds: string[];
}

export interface CatalogueListParams {
  limit?: number;
  cursor?: string;
}

// ─── Price Lists ──────────────────────────────────────────────────────────────

export enum PriceListRuleSelectorType {
  ALL_PRODUCTS = 'ALL_PRODUCTS',
  PRODUCT = 'PRODUCT',
}

export enum PriceListRuleValueType {
  FIXED_PRICE = 'FIXED_PRICE',
  PERCENTAGE_DISCOUNT = 'PERCENTAGE_DISCOUNT',
}

export enum PriceListRuleDiscountBaseType {
  PRODUCT_PRICE = 'PRODUCT_PRICE',
  PRICE_LIST = 'PRICE_LIST',
}

export interface PriceListRule {
  id: string;
  distributorId: string;
  priceListId: string;
  selectorType: PriceListRuleSelectorType;
  productId: string | null;
  productVariantId: string | null;
  productName?: string | null;
  minQuantity: number;
  valueType: PriceListRuleValueType;
  unitPrice: string | null;
  discountPercentage: string | null;
  discountBaseType: PriceListRuleDiscountBaseType | null;
  basePriceListId: string | null;
  currency: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceList {
  id: string;
  distributorId: string;
  name: string;
  description: string | null;
  currency: string;
  isDefault: boolean;
  active: boolean;
  rules: PriceListRule[];
  createdAt: string;
  updatedAt: string;
}

export interface PriceListSummary {
  id: string;
  distributorId: string;
  name: string;
  description: string | null;
  currency: string;
  isDefault: boolean;
  active: boolean;
  _count: { rules: number };
  createdAt: string;
  updatedAt: string;
}

export interface ProductPricingEntry {
  priceListId: string;
  priceListName: string;
  currency: string;
  rule: PriceListRule;
}

export interface CreatePriceListRequest {
  name: string;
  description?: string;
  currency?: string;
}

export type UpdatePriceListRequest = Partial<CreatePriceListRequest> & {
  active?: boolean;
};

export interface CreatePriceListRuleRequest {
  selectorType: PriceListRuleSelectorType;
  productId?: string;
  minQuantity?: number;
  valueType?: PriceListRuleValueType;
  unitPrice?: string;
  discountPercentage?: string;
  discountBaseType?: PriceListRuleDiscountBaseType;
  basePriceListId?: string;
  currency?: string;
  sortOrder?: number;
}

export type UpdatePriceListRuleRequest = Partial<Omit<CreatePriceListRuleRequest, 'selectorType' | 'valueType'>> & {
  active?: boolean;
};

export interface AssignPriceListRequest {
  priceListId: string | null;
}

export interface PriceListListParams {
  limit?: number;
  cursor?: string;
}

// ─── Distributor Settings ─────────────────────────────────────────────────────

export interface DistributorSettings {
  name: string;
  email: string | null;
  phone: string | null;
  slug: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;
  timezone: string;
  currencyCode: string;
  defaultOrderAcceptanceMode: OrderAcceptanceMode;
  marketplaceVisible: boolean;
  marketplaceDescription: string | null;
  tagline: string | null;
  aboutText: string | null;
  orderNotificationEmails: string[];
  processingDays: number[];
  minimumOrderSpend: string | null;
}

export type UpdateDistributorSettingsRequest = Partial<DistributorSettings>;

// ─── Accounting Integration ────────────────────────────────────────────────────
// Provider-neutral: Xero is the first AccountingProvider, not the shape of
// the type — a second provider later adds to the union, nothing else changes.

export type AccountingProvider = 'XERO';
export type AccountingConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'REVOKED';
// Status invoices are created with in the accounting system (provider-neutral
// vocabulary; each provider adapter maps it onto its own status model).
export type AccountingInvoiceTargetStatus = 'DRAFT' | 'SUBMITTED' | 'AUTHORISED';
// Lifecycle of one order's invoice export to the accounting system.
export type AccountingInvoiceExportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface AccountingConnectionStatusResponse {
  provider: AccountingProvider;
  status: AccountingConnectionStatus;
  externalOrganisationName: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  invoiceExportTargetStatus: AccountingInvoiceTargetStatus;
}

export interface UpdateAccountingConnectionSettingsRequest {
  invoiceExportTargetStatus: AccountingInvoiceTargetStatus;
}

export interface AccountingAuthorizationUrlResponse {
  authorizationUrl: string;
}

// ─── Accounting Contacts (Phase 2: sync/import/manage) ────────────────────────
// A contact's status is computed at read time (see apps/api's
// AccountingContactService), never stored — it's derived from whether an
// active mapping/suggestion exists, not a column on any row.

export type AccountingContactStatus =
  | 'LINKED'
  | 'SUGGESTED'
  | 'READY_TO_IMPORT'
  | 'NOT_A_CUSTOMER'
  | 'IGNORED'
  | 'ARCHIVED'
  | 'CONFLICT';

// The provider's own contact classification (customers/suppliers/archived) —
// distinct from AccountingContactStatus, which is "what does Wholo need
// you to do" rather than "which provider bucket is this in".
export type AccountingContactType = 'customers' | 'suppliers' | 'archived';

export type AccountingContactMatchMethod =
  | 'ACCOUNT_CODE_EXACT'
  | 'EMAIL_EXACT'
  | 'NAME_EXACT'
  | 'NAME_POSTCODE'
  | 'NAME_FUZZY'
  | 'MANUAL';

export interface AccountingContactMappingSummary {
  id: string;
  tradeRelationshipId: string;
  customerName: string;
  matchMethod: AccountingContactMatchMethod;
  linkedAt: string;
}

export interface AccountingContactSuggestionSummary {
  id: string;
  tradeRelationshipId: string;
  customerName: string;
  confidence: number;
  matchMethod: AccountingContactMatchMethod;
  matchReason: string;
}

export interface AccountingContactSummary {
  id: string;
  displayName: string;
  email: string | null;
  externalContactCode: string | null;
  externalAccountNumber: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  isArchived: boolean;
  ignoredAt: string | null;
  // Set when a linked contact's watched fields (name/email) changed on a
  // later sync — cleared only by an explicit "Acknowledge" action, never by
  // a subsequent sync (the value itself is never auto-applied).
  changeDetectedAt: string | null;
  changeAcknowledgedAt: string | null;
  status: AccountingContactStatus;
  mapping: AccountingContactMappingSummary | null;
  suggestion: AccountingContactSuggestionSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingContactListParams {
  limit?: number;
  cursor?: string;
  search?: string;
  status?: AccountingContactStatus[];
  type?: AccountingContactType[];
}

export interface AccountingContactListResponse {
  data: AccountingContactSummary[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

export interface AccountingContactSyncRequestedResponse {
  queued: true;
}

export interface AccountingContactNeedsAttentionCountResponse {
  count: number;
}

export interface OrderNeedsAttentionCountResponse {
  count: number;
}

export interface ImportAccountingContactRequest {
  name?: string;
  legalName?: string;
  phone?: string;
  accountNumber?: string;
  billingLine1?: string;
  billingLine2?: string;
  billingCity?: string;
  billingState?: string;
  billingPostcode?: string;
  billingCountry?: string;
}

export interface MatchAccountingContactRequest {
  tradeRelationshipId: string;
}

// ─── Accounting Products (Phase 3: sync/import/manage) ────────────────────────
// A product's status is computed at read time (see apps/api's
// AccountingProductService), never stored — it's derived from whether an
// active mapping/suggestion exists, not a column on any row.

export type AccountingProductStatus =
  | 'LINKED'
  | 'SUGGESTED'
  | 'READY_TO_IMPORT'
  | 'NOT_SOLD'
  | 'IGNORED'
  | 'INACTIVE'
  | 'CONFLICT';

// The provider's own item flags (sold/purchased/tracked-as-inventory) —
// distinct from AccountingProductStatus, which is "what does Wholo need
// you to do" rather than "which provider bucket is this in".
export type AccountingProductType = 'sold' | 'purchased' | 'tracked';

export type AccountingProductMatchMethod =
  | 'SKU_EXACT'
  | 'SKU_NORMALISED'
  | 'NAME_EXACT'
  | 'NAME_FUZZY'
  | 'MANUAL';

export interface AccountingProductMappingSummary {
  id: string;
  productId: string;
  productName: string;
  matchMethod: AccountingProductMatchMethod;
  linkedAt: string;
}

export interface AccountingProductSuggestionSummary {
  id: string;
  productId: string;
  productName: string;
  confidence: number;
  matchMethod: AccountingProductMatchMethod;
  matchReason: string;
}

export interface AccountingProductSummary {
  id: string;
  displayName: string;
  description: string | null;
  externalProductCode: string | null;
  // Decimal string at the provider's precision (up to 4 dp for Xero) —
  // rounded to 2 dp only when imported into Product.price.
  salesUnitPrice: string | null;
  quantityOnHand: string | null;
  isSold: boolean;
  isPurchased: boolean;
  isTracked: boolean;
  isActive: boolean;
  ignoredAt: string | null;
  // Set when a linked product's watched fields (price/tax code) changed on a
  // later sync — cleared only by an explicit "Acknowledge" action, never by
  // a subsequent sync (the value itself is never auto-applied).
  changeDetectedAt: string | null;
  changeAcknowledgedAt: string | null;
  status: AccountingProductStatus;
  mapping: AccountingProductMappingSummary | null;
  suggestion: AccountingProductSuggestionSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingProductListParams {
  limit?: number;
  cursor?: string;
  search?: string;
  status?: AccountingProductStatus[];
  type?: AccountingProductType[];
}

export interface AccountingProductListResponse {
  data: AccountingProductSummary[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

export interface AccountingProductSyncRequestedResponse {
  queued: true;
}

export interface AccountingProductNeedsAttentionCountResponse {
  count: number;
}

export interface ImportAccountingProductRequest {
  name?: string;
  description?: string;
  sku?: string;
  price?: string;
  productTypeId?: string;
  supplierId?: string;
}

export interface MatchAccountingProductRequest {
  productId: string;
  // Resubmit-with-confirmation after a TAX_TYPE_CONFLICT 409 (the matched
  // accounting product's resolved tax type would overwrite a different one
  // already set on the target Wholo product).
  confirmTaxTypeOverride?: boolean;
}

export interface ConfirmAccountingProductSuggestionRequest {
  confirmTaxTypeOverride?: boolean;
}

// ─── Accounting Tax Types (Phase 3: sync/import/manage) ───────────────────────
// A tax type's status is computed at read time (see apps/api's
// AccountingTaxTypeService), never stored — same pattern as
// AccountingProductStatus. Deliberately no "type"/bulk-import support —
// tax rates are a small, near-static set (no FilterBar in the admin UI).

export type AccountingTaxTypeStatus =
  | 'LINKED'
  | 'SUGGESTED'
  | 'CONFLICT'
  | 'IGNORED'
  | 'INACTIVE'
  | 'READY_TO_IMPORT';

export type AccountingTaxTypeMatchMethod = 'NAME_EXACT' | 'NAME_NORMALISED' | 'NAME_FUZZY' | 'MANUAL';

export interface AccountingTaxTypeMappingSummary {
  id: string;
  taxTypeId: string;
  taxTypeName: string;
  matchMethod: AccountingTaxTypeMatchMethod;
  linkedAt: string;
}

export interface AccountingTaxTypeSuggestionSummary {
  id: string;
  taxTypeId: string;
  taxTypeName: string;
  confidence: number;
  matchMethod: AccountingTaxTypeMatchMethod;
  matchReason: string;
}

export interface AccountingTaxTypeSummary {
  id: string;
  // Xero's natural key for a tax rate (e.g. "OUTPUT2") — there is no GUID.
  taxType: string;
  displayName: string;
  // Decimal string at the provider's precision (up to 4 dp for Xero).
  ratePercentage: string;
  isActive: boolean;
  ignoredAt: string | null;
  // Set when a linked tax rate's watched fields (rate/status/name) changed
  // on a later sync — cleared only by an explicit "Acknowledge" action,
  // never by a subsequent sync. The Stocdup TaxType's rate is never
  // auto-updated from a sync.
  changeDetectedAt: string | null;
  changeAcknowledgedAt: string | null;
  status: AccountingTaxTypeStatus;
  mapping: AccountingTaxTypeMappingSummary | null;
  suggestion: AccountingTaxTypeSuggestionSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingTaxTypeListParams {
  limit?: number;
  cursor?: string;
}

export interface AccountingTaxTypeListResponse {
  data: AccountingTaxTypeSummary[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

export interface AccountingTaxTypeSyncRequestedResponse {
  queued: true;
}

export interface AccountingTaxTypeNeedsAttentionCountResponse {
  count: number;
}

// classification has no Xero equivalent, so it's always required here, never
// defaulted or guessed from the imported rate.
export interface ImportAccountingTaxTypeRequest {
  name?: string;
  classification: TaxClassification;
  ratePercentage?: string;
}

export interface MatchAccountingTaxTypeRequest {
  taxTypeId: string;
}

// ─── Accounting bulk import ────────────────────────────────────────────────────
// A bulk-import job runs asynchronously (batches can run into the thousands) —
// the request just queues it; progress and the final per-item report are read
// back via AccountingBulkImportJob. Product and contact selections share this
// shape but are kept as distinct request types since their status/type
// vocabularies differ (AccountingProductStatus/Type vs AccountingContactStatus/Type).

export type AccountingBulkImportRecordType = 'PRODUCT' | 'CONTACT';
export type AccountingBulkImportJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type AccountingBulkImportOutcome = 'imported' | 'matched' | 'skipped' | 'failed';

export interface BulkImportProductSelectionRequest {
  // Exactly one of ids/filter — selecting a few specific rows, or every row
  // currently matching a server-side filter (re-resolved at process time).
  ids?: string[];
  filter?: {
    status?: AccountingProductStatus[];
    type?: AccountingProductType[];
    search?: string;
  };
  // Default false: bulk import creates new products by default, ignoring any
  // system-suggested match — this opts into linking suggested items instead.
  honourSuggestions?: boolean;
}

export interface BulkImportContactSelectionRequest {
  ids?: string[];
  filter?: {
    status?: AccountingContactStatus[];
    type?: AccountingContactType[];
    search?: string;
  };
  honourSuggestions?: boolean;
}

export interface BulkImportJobResponse {
  jobId: string;
}

export interface AccountingBulkImportResultItem {
  externalId: string;
  displayName: string;
  outcome: AccountingBulkImportOutcome;
  error?: string;
}

export interface AccountingBulkImportJob {
  id: string;
  distributorId: string;
  recordType: AccountingBulkImportRecordType;
  status: AccountingBulkImportJobStatus;
  honourSuggestions: boolean;
  totalCount: number;
  importedCount: number;
  matchedCount: number;
  skippedCount: number;
  failedCount: number;
  results: AccountingBulkImportResultItem[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

// ─── Asset Images ─────────────────────────────────────────────────────────────

export interface AssetImage {
  id: string;
  assetType: string;
  entityId: string;
  distributorId: string;
  variants: Record<string, string>;
  dominantColor: string | null;
  sourceFilename: string | null;
  sourceMimeType: string;
  sourceSizeBytes: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReorderAssetImagesRequest {
  assetType: string;
  entityId: string;
  imageIds: string[];
}

// ─── Delivery Profiles ────────────────────────────────────────────────────────

export interface DeliveryProfileCutoffRule {
  id: string;
  deliveryProfileId: string;
  weekday: number;
  cutoffTime: string;
  processingDaysBeforeDelivery: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryProfile {
  id: string;
  distributorId: string;
  name: string;
  active: boolean;
  defaultWeekdays: number[];
  defaultCutoffTime: string;
  defaultCutoffProcessingDays: number;
  speciallyEnabledDates: string[];
  speciallyDisabledDates: string[];
  cutoffRules: DeliveryProfileCutoffRule[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryProfileSummary {
  id: string;
  distributorId: string;
  name: string;
  active: boolean;
  defaultWeekdays: number[];
  _count: { customerSettings: number };
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliveryProfileRequest {
  name: string;
  defaultWeekdays?: number[];
  defaultCutoffTime?: string;
  defaultCutoffProcessingDays?: number;
  speciallyEnabledDates?: string[];
  speciallyDisabledDates?: string[];
  active?: boolean;
}

export interface UpdateDeliveryProfileRequest {
  name?: string;
  active?: boolean;
  defaultWeekdays?: number[];
  defaultCutoffTime?: string;
  defaultCutoffProcessingDays?: number;
  speciallyEnabledDates?: string[];
  speciallyDisabledDates?: string[];
}

export interface CreateDeliveryProfileCutoffRuleRequest {
  weekday: number;
  cutoffTime: string;
  processingDaysBeforeDelivery: number;
}

export type UpdateDeliveryProfileCutoffRuleRequest = Partial<CreateDeliveryProfileCutoffRuleRequest>;

export interface AssignDeliveryProfileRequest {
  deliveryProfileId: string | null;
}

export interface DeliveryProfileListParams {
  limit?: number;
  cursor?: string;
}

export interface AvailableDeliveryDate {
  date: string;
  cutoffDeadline: string;
}

export interface DeliveryAvailabilityResponse {
  dates: AvailableDeliveryDate[];
  profileId: string | null;
}

// ─── Delivery Routes (native delivery planning) ──────────────────────────────
// Reusable customer groupings with a usual drop order — deliberately
// separate from DeliveryProfile above, which governs when a customer may be
// delivered to, not which run they normally travel with.

export interface DeliveryRouteCustomer {
  id: string;
  routeId: string;
  customerId: string;
  customerName?: string;
  deliveryAddress?: {
    addressLine1: string | null;
    addressCity: string | null;
    addressPostcode: string | null;
  };
  defaultDropPosition: number;
  assignedAt: string;
}

export interface DeliveryRoute {
  id: string;
  distributorId: string;
  name: string;
  code: string | null;
  defaultDriverName: string | null;
  active: boolean;
  customers: DeliveryRouteCustomer[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryRouteSummary {
  id: string;
  distributorId: string;
  name: string;
  code: string | null;
  defaultDriverName: string | null;
  active: boolean;
  customerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliveryRouteRequest {
  name: string;
  code?: string;
  defaultDriverName?: string;
  active?: boolean;
}

export interface UpdateDeliveryRouteRequest {
  name?: string;
  code?: string;
  defaultDriverName?: string;
  active?: boolean;
}

export interface AssignRouteCustomerRequest {
  customerId: string;
}

export interface ReorderRouteCustomersRequest {
  orderedCustomerIds: string[];
}

export interface DeliveryRouteListParams {
  limit?: number;
  cursor?: string;
  active?: boolean;
}

// ─── Delivery Runs board (native delivery planning) ───────────────────────────
// Why an order ended up with no run allocation. Computed, never stored — the
// board derives it at read time from the same facts the allocation worker
// uses (see DeliveryRunAllocationService.allocateOrder).
export type UnallocatedReason = 'NO_SCHEDULED_DATE' | 'NO_ROUTE' | 'RUN_READY';
export type DeliveryAttention = 'NONE' | 'UNASSIGNED' | 'MISSED';

export interface DeliveryCardAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export interface DeliveryCard {
  orderId: string;
  orderNumber: string;
  traderCustomerId: string;
  customerName: string;
  deliveryAddress: DeliveryCardAddress | null;
  stopNumber: number | null;        // null when unassigned
  lineCount: number;
  itemCount: number;                // SUM(quantityOrdered)
  attention: DeliveryAttention;
  unallocatedReason: UnallocatedReason | null;
  suggestedRunId: string | null;
  suggestedRouteName: string | null;
  scheduledDeliveryDate: string | null;
  // The customer's original agreed date — immutable, retained permanently
  // even as scheduledDeliveryDate is replanned. Used client-side to detect
  // "date drift" when changing the delivery date (M5).
  requestedDeliveryDate: string | null;
  allocationSource: 'DEFAULT_ROUTE' | 'MANUAL' | 'EXTERNAL_PROVIDER' | null;
}

export interface DeliveryRunColumn {
  runId: string;
  routeId: string | null;
  name: string;
  driverName: string | null;
  status: 'OPEN' | 'READY';
  version: number;
  cards: DeliveryCard[];
  stopCount: number;   // card count, not distinct customers
  itemCount: number;
}

export interface DeliveryDayBoard {
  distributorId: string;
  date: string;
  runs: DeliveryRunColumn[];
  unassigned: DeliveryCard[];
}

export interface DeliveryDaySummary {
  date: string;
  runCount: number;
  stopCount: number;
  unassignedCount: number;
}

export interface DeliveryDaysListParams {
  from: string;
  to: string;
}

export interface DeliveryDaysListResponse {
  data: DeliveryDaySummary[];   // no pagination block — bounded, capped window
}

export interface AssignOrderToRunRequest {
  orderId: string;
  version: number;
  sourceRunId?: string;
  position?: number;
}

export interface ReorderRunOrdersRequest {
  version: number;
  orderedOrderIds: string[];
}

// Mark ready ({status: 'READY'}), reopen ({status: 'OPEN'}), and driver
// override (driverName, null clears it) — one PATCH of the DeliveryRun
// resource itself, per CLAUDE.md's "prefer coarse resources over
// fine-grained field endpoints".
export interface UpdateDeliveryRunRequest {
  version: number;
  status?: 'OPEN' | 'READY';
  driverName?: string | null;
}

// ─── Change delivery date (M5) ────────────────────────────────────────────────
// Another accepted order at the same delivery address, within the
// distributor's configured nearbyDeliveryWindowDays of a candidate date.
// Reviewable suggestion only — surfaced so staff can notice a consolidation
// opportunity by hand; nothing is ever auto-merged/moved.
export interface NearbyDelivery {
  orderId: string;
  orderNumber: string;
  customerName: string;
  scheduledDeliveryDate: string | null;
  runId: string | null;
  runName: string | null;
}

// Read-only preview for a candidate date, fetched live as the date is edited
// in ChangeDeliveryDateDialog, before anything is committed. `runId: null`
// with `allocated: true` means a run doesn't exist for that date yet — it
// would be lazily created on commit, matching getDay's own "null reason is
// allocatable" convention.
export interface ReschedulePreviewResponse {
  resolution:
    | { allocated: true; runId: string | null; runName: string }
    | { allocated: false; reason: UnallocatedReason };
  nearbyDeliveries: NearbyDelivery[];
}

export interface ChangeScheduledDeliveryDateRequest {
  scheduledDeliveryDate: string;
  // CAS target — the order's last-known scheduledDeliveryDate. Always
  // required (Order has no version column to fall back on), null when the
  // order has never had a scheduled date.
  expectedScheduledDeliveryDate: string | null;
}

// Deliberately not a DeliveryDayBoard — unlike M3's mutations, this action
// can move an order to a different day than the one on screen, so "the"
// board doesn't apply. The caller refetches whichever day is currently open.
export interface ChangeScheduledDeliveryDateResponse {
  orderId: string;
  scheduledDeliveryDate: string;
  requestedDeliveryDate: string | null;
  allocation:
    | { allocated: true; runId: string; runName: string }
    | { allocated: false; reason: UnallocatedReason };
}

// ─── Analytics (wholesaler homepage dashboard) ────────────────────────────────

export type AnalyticsPeriodKey = 'today' | 'week' | 'month' | 'rolling7' | 'rolling30' | 'rolling90' | 'rolling365' | 'custom';

export interface AnalyticsPeriodQuery {
  period?: AnalyticsPeriodKey;
  start?: string;
  end?: string;
  limit?: number;
}

export interface AnalyticsPeriod {
  key: AnalyticsPeriodKey;
  start: string;
  end: string;
}

export type ComparisonStatus = 'value' | 'new' | 'insufficient_history';

export interface AnalyticsComparison {
  current: number;
  comparison: number | null;
  status: ComparisonStatus;
  absoluteChange: number | null;
  percentageChange: number | null;
}

export interface OrderSummaryResponse {
  distributorId: string;
  timezone: string;
  period: AnalyticsPeriod;
  comparisonPeriod: AnalyticsPeriod | null;
  generatedAt: string;
  metrics: {
    orderValue: AnalyticsComparison;
    orderCount: AnalyticsComparison;
    purchasingCustomers: AnalyticsComparison;
    averageOrderValue: AnalyticsComparison;
  };
}

export interface OrderTrendPoint {
  date: string;
  value: number;
  count: number;
}

export interface OrderTrendResponse {
  distributorId: string;
  timezone: string;
  period: AnalyticsPeriod;
  comparisonPeriod: AnalyticsPeriod | null;
  generatedAt: string;
  current: OrderTrendPoint[];
  comparison: OrderTrendPoint[];
}

export interface CustomerRanking {
  customerId: string;
  customerName: string;
  value: number;
  orderCount: number;
  share: number | null;
  change: AnalyticsComparison;
}

export interface CustomerRankingsResponse {
  distributorId: string;
  timezone: string;
  period: AnalyticsPeriod;
  comparisonPeriod: AnalyticsPeriod | null;
  generatedAt: string;
  totalQualifyingValue: number;
  top5Share: number | null;
  customers: CustomerRanking[];
}

export interface ProductRanking {
  productId: string;
  productName: string;
  value: number;
  units: number;
  reach: number;
}

export interface NonSellingProduct {
  productId: string;
  productName: string;
}

export interface ProductRankingsResponse {
  distributorId: string;
  timezone: string;
  period: AnalyticsPeriod;
  comparisonPeriod: AnalyticsPeriod | null;
  generatedAt: string;
  products: ProductRanking[];
  nonSellingProducts: NonSellingProduct[];
}

export interface ActionItemOrder {
  id: string;
  orderNumber: string;
  traderCustomerId: string;
  submittedAt?: string | null;
  requestedDeliveryDate?: string | null;
  totalAmount: string;
}

export interface ActionItemInvoiceFailure {
  id: string;
  orderId: string;
  errorCode: string | null;
  errorMessage: string | null;
  failedAt: string | null;
}

export interface ActionItemNeverOrderedCustomer {
  customerId: string;
  customerName: string;
}

export interface ActionItemsResponse {
  distributorId: string;
  generatedAt: string;
  awaitingAcceptance: ActionItemOrder[];
  dueForFulfilment: ActionItemOrder[];
  invoiceFailures: ActionItemInvoiceFailure[];
  neverOrdered: ActionItemNeverOrderedCustomer[];
}

// ─── Admin notifications ───────────────────────────────────────────────────────
// A general-purpose in-app notification inbox for admin users (the header
// bell) — distinct from any customer/order transactional email pipeline.
// type is a free-form string, not a closed union: this is meant to be a
// generalized mechanism with more than one producer over time (the accounting
// bulk-import job is only the first).

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  linkPath: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadCountResponse {
  count: number;
}
