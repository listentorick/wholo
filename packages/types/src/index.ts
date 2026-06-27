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
  orderId: string;
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
  createdAt: string;
  updatedAt: string;
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
  status?: ProductStatus;
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

export interface CustomerListParams {
  limit?: number;
  cursor?: string;
  status?: TradeRelationshipStatus;
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
