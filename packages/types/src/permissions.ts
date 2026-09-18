// Static permission taxonomy for the RBAC permission-resolution system.
// Role -> Permission mapping is intentionally hardcoded (not configurable) —
// see the Multi-Role RBAC PBI's explicit out-of-scope item.
export enum Permission {
  ORDER_AS_INITIATE = 'order-as:initiate',

  ORDERS_READ = 'orders:read',
  ORDERS_MANAGE = 'orders:manage',

  CATALOGUE_READ = 'catalogue:read',
  CATALOGUE_MANAGE = 'catalogue:manage',

  CUSTOMERS_READ = 'customers:read',
  CUSTOMERS_MANAGE = 'customers:manage',

  PRICE_LISTS_MANAGE = 'price-lists:manage',

  SUPPLIERS_MANAGE = 'suppliers:manage',

  DELIVERY_READ = 'delivery:read',
  DELIVERY_MANAGE = 'delivery:manage',

  ACCOUNTING_READ = 'accounting:read',
  ACCOUNTING_MANAGE = 'accounting:manage',

  SETTINGS_MANAGE = 'settings:manage',

  ASSET_IMAGES_MANAGE = 'asset-images:manage',

  ANALYTICS_READ = 'analytics:read',

  TAX_TYPES_MANAGE = 'tax-types:manage',

  ADMIN_NOTIFICATIONS_MANAGE = 'admin-notifications:manage',
}
