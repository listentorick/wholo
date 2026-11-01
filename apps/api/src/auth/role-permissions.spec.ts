import { Role } from '@prisma/client';
import { Permission } from '@wholo/types';
import { ROLE_PERMISSIONS } from './role-permissions';

describe('ROLE_PERMISSIONS', () => {
  it('has an entry for every Role enum value', () => {
    for (const role of Object.values(Role)) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  const PLATFORM_PERMISSIONS = [
    Permission.PLATFORM_DISTRIBUTORS_READ,
    Permission.PLATFORM_STATS_READ,
    Permission.SUPPORT_GRANTS_SELF_CREATE,
  ];

  it('gives PLATFORM_ADMIN only the platform permissions, nothing inside a distributor', () => {
    expect(ROLE_PERMISSIONS[Role.PLATFORM_ADMIN].sort()).toEqual([...PLATFORM_PERMISSIONS].sort());
  });

  it('gives the platform permissions to PLATFORM_ADMIN alone', () => {
    for (const role of Object.values(Role)) {
      for (const permission of PLATFORM_PERMISSIONS) {
        expect(ROLE_PERMISSIONS[role].includes(permission)).toBe(role === Role.PLATFORM_ADMIN);
      }
    }
  });

  it('gives SUPPORT configuration access, including the accounting connection, but not the team or order-as', () => {
    const perms = ROLE_PERMISSIONS[Role.SUPPORT];
    expect(perms).toEqual(
      expect.arrayContaining([
        Permission.CATALOGUE_MANAGE,
        Permission.PRICE_LISTS_MANAGE,
        Permission.CUSTOMERS_MANAGE,
        Permission.DELIVERY_MANAGE,
        Permission.SETTINGS_MANAGE,
        Permission.ACCOUNTING_IMPORT,
        Permission.ACCOUNTING_MANAGE,
      ]),
    );
    for (const p of [Permission.TEAM_MANAGE, Permission.ORDER_AS_INITIATE]) {
      expect(perms).not.toContain(p);
    }
  });

  it('gives only the distributor-side management roles the order-as initiation permission', () => {
    const allowed: Role[] = [Role.DISTRIBUTOR_ADMIN, Role.OPERATIONS_MANAGER];
    for (const role of Object.values(Role)) {
      if (allowed.includes(role)) {
        expect(ROLE_PERMISSIONS[role]).toContain(Permission.ORDER_AS_INITIATE);
      } else {
        expect(ROLE_PERMISSIONS[role]).not.toContain(Permission.ORDER_AS_INITIATE);
      }
    }
  });

  it('gives TRADE_CUSTOMER no manage permissions', () => {
    const manageOnly = ROLE_PERMISSIONS[Role.TRADE_CUSTOMER].filter((p) => p.endsWith(':manage'));
    expect(manageOnly).toEqual([]);
  });

  it('gives team management only to DISTRIBUTOR_ADMIN', () => {
    for (const role of Object.values(Role)) {
      const has = ROLE_PERMISSIONS[role].includes(Permission.TEAM_MANAGE);
      expect(has).toBe(role === Role.DISTRIBUTOR_ADMIN);
    }
  });

  it('gives OPERATIONS_MANAGER day-to-day operations, tax types and accounting import', () => {
    const perms = ROLE_PERMISSIONS[Role.OPERATIONS_MANAGER];
    expect(perms).toEqual(
      expect.arrayContaining([
        Permission.ORDERS_MANAGE,
        Permission.CUSTOMERS_MANAGE,
        Permission.CATALOGUE_MANAGE,
        Permission.PRICE_LISTS_MANAGE,
        Permission.DELIVERY_MANAGE,
        Permission.TAX_TYPES_READ,
        Permission.TAX_TYPES_MANAGE,
        Permission.ACCOUNTING_READ,
        Permission.ACCOUNTING_IMPORT,
      ]),
    );
  });

  it('gives the integration connection to the Owner and to Stocdup support only', () => {
    for (const role of Object.values(Role)) {
      expect(ROLE_PERMISSIONS[role].includes(Permission.ACCOUNTING_MANAGE)).toBe(
        role === Role.DISTRIBUTOR_ADMIN || role === Role.SUPPORT,
      );
    }
  });

  it('gives company settings to the Owner and to Stocdup support only', () => {
    for (const role of Object.values(Role)) {
      expect(ROLE_PERMISSIONS[role].includes(Permission.SETTINGS_MANAGE)).toBe(
        role === Role.DISTRIBUTOR_ADMIN || role === Role.SUPPORT,
      );
    }
  });

  it('gives the Owner every distributor permission, including the per-type accounting and tax-type ones', () => {
    for (const p of [Permission.TAX_TYPES_READ, Permission.TAX_TYPES_MANAGE, Permission.ACCOUNTING_READ, Permission.ACCOUNTING_IMPORT, Permission.ACCOUNTING_MANAGE]) {
      expect(ROLE_PERMISSIONS[Role.DISTRIBUTOR_ADMIN]).toContain(p);
    }
  });

  it('never grants a manage-level permission without the matching read, so read-only screens always load', () => {
    const pairs: [Permission, Permission][] = [
      [Permission.TAX_TYPES_MANAGE, Permission.TAX_TYPES_READ],
      [Permission.ACCOUNTING_IMPORT, Permission.ACCOUNTING_READ],
      [Permission.ACCOUNTING_MANAGE, Permission.ACCOUNTING_READ],
    ];
    for (const role of Object.values(Role)) {
      for (const [stronger, read] of pairs) {
        if (ROLE_PERMISSIONS[role].includes(stronger)) expect(ROLE_PERMISSIONS[role]).toContain(read);
      }
    }
  });

  it('gives DRIVER only delivery permissions', () => {
    expect(ROLE_PERMISSIONS[Role.DRIVER].sort()).toEqual([Permission.DELIVERY_READ, Permission.DELIVERY_MANAGE].sort());
  });
});
