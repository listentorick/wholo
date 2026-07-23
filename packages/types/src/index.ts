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

export type SessionStatus = 'ACTIVE' | 'ONBOARDING_REQUIRED';

/** Identity claims from Keycloak for a person who has no Wholo user yet. */
export interface SessionIdentity {
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthSession {
  status: SessionStatus;
  /** Present when status is ACTIVE. */
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
  product: { id: string; name: string; sku: string | null };
}

export interface CartResponse {
  orderId: string | null;
  items: CartItem[];
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
  skuSnapshot: string | null;
  productNameSnapshot: string;
  unitOfMeasureSnapshot: string | null;
  quantityOrdered: number;
  unitPriceSnapshot: string;
  taxRateSnapshot: string;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
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

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: string;
  traderCustomerName: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  requestedDeliveryDate: string | null;
}

export interface SubmitOrderRequest {
  distributorSlug: string;
  customerReference?: string;
  notes?: string;
  requestedDeliveryDate?: string;
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
  sortBy?: 'createdAt' | 'requestedDeliveryDate';
  sortOrder?: 'asc' | 'desc';
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
  compareAtPrice: string | null;
  productType: ProductType | null;
  supplier: Supplier | null;
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
  compareAtPrice: string | null;
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
  price?: string;
  compareAtPrice?: string;
}

export type UpdateProductRequest = Partial<CreateProductRequest>;

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

export type UpdateCustomerRequest = Partial<CreateCustomerRequest> & {
  status?: TradeRelationshipStatus;
};

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
