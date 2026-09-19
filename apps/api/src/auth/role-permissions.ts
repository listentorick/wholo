import { Role } from '@prisma/client';
import { Permission } from '@wholo/types';

// Hardcoded role -> permission mapping (not configurable — see the
// Multi-Role RBAC PBI's out-of-scope item). WAREHOUSE_STAFF and DRIVER are
// given coherent permission sets even though nothing assigns those roles to
// a real membership yet, so the taxonomy stays consistent as they come into use.
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.PLATFORM_ADMIN]: Object.values(Permission),
  [Role.DISTRIBUTOR_ADMIN]: [
    Permission.ORDER_AS_INITIATE,
    Permission.ORDERS_READ,
    Permission.ORDERS_MANAGE,
    Permission.CATALOGUE_READ,
    Permission.CATALOGUE_MANAGE,
    Permission.CUSTOMERS_READ,
    Permission.CUSTOMERS_MANAGE,
    Permission.PRICE_LISTS_MANAGE,
    Permission.SUPPLIERS_MANAGE,
    Permission.DELIVERY_READ,
    Permission.DELIVERY_MANAGE,
    Permission.ACCOUNTING_READ,
    Permission.ACCOUNTING_IMPORT,
    Permission.ACCOUNTING_MANAGE,
    Permission.SETTINGS_MANAGE,
    Permission.ASSET_IMAGES_MANAGE,
    Permission.ANALYTICS_READ,
    Permission.TAX_TYPES_READ,
    Permission.TAX_TYPES_MANAGE,
    Permission.ADMIN_NOTIFICATIONS_MANAGE,
    Permission.TEAM_MANAGE,
  ],
  // Runs the business day to day, including tax types and importing accounting
  // data. Deliberately without company settings, the integration CONNECTION
  // (accounting:manage: connect / settings / disconnect) and team management
  // — those stay Owner-only.
  [Role.OPERATIONS_MANAGER]: [
    Permission.ORDER_AS_INITIATE,
    Permission.ORDERS_READ,
    Permission.ORDERS_MANAGE,
    Permission.CATALOGUE_READ,
    Permission.CATALOGUE_MANAGE,
    Permission.CUSTOMERS_READ,
    Permission.CUSTOMERS_MANAGE,
    Permission.PRICE_LISTS_MANAGE,
    Permission.SUPPLIERS_MANAGE,
    Permission.DELIVERY_READ,
    Permission.DELIVERY_MANAGE,
    Permission.ACCOUNTING_READ,
    Permission.ACCOUNTING_IMPORT,
    Permission.TAX_TYPES_READ,
    Permission.TAX_TYPES_MANAGE,
    Permission.ASSET_IMAGES_MANAGE,
    Permission.ANALYTICS_READ,
    Permission.ADMIN_NOTIFICATIONS_MANAGE,
  ],
  [Role.WAREHOUSE_STAFF]: [
    Permission.ORDERS_READ,
    Permission.ORDERS_MANAGE,
    Permission.CATALOGUE_READ,
    Permission.CUSTOMERS_READ,
    Permission.DELIVERY_READ,
    Permission.DELIVERY_MANAGE,
  ],
  [Role.DRIVER]: [Permission.DELIVERY_READ, Permission.DELIVERY_MANAGE],
  [Role.TRADE_CUSTOMER]: [Permission.CATALOGUE_READ],
};
