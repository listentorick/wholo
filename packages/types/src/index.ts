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

// ─── Orders ──────────────────────────────────────────────────────────────────

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PLACED = 'PLACED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
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
  productType: CatalogueProductType | null;
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
  email: string | null;
  phone: string | null;
}

export interface LatestInvitation {
  status: InvitationStatus;
  email: string;
  expiresAt: string;
}

export interface Customer {
  id: string;
  organisationId: string;
  distributorId: string;
  status: TradeRelationshipStatus;
  organisation: CustomerOrganisation;
  accountNumber: string | null;
  creditLimit: string | null;
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
  latestInvitation: LatestInvitation | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListParams {
  limit?: number;
  cursor?: string;
  status?: TradeRelationshipStatus;
}

export interface CreateCustomerRequest {
  name: string;
  email?: string;
  phone?: string;
  accountNumber?: string;
  creditLimit?: string;
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
