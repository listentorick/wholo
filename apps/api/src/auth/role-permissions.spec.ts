import { Role } from '@prisma/client';
import { Permission } from '@wholo/types';
import { ROLE_PERMISSIONS } from './role-permissions';

describe('ROLE_PERMISSIONS', () => {
  it('has an entry for every Role enum value', () => {
    for (const role of Object.values(Role)) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('gives PLATFORM_ADMIN every permission', () => {
    expect(ROLE_PERMISSIONS[Role.PLATFORM_ADMIN].sort()).toEqual(Object.values(Permission).sort());
  });

  it('gives only the distributor-side management roles (and the superset PLATFORM_ADMIN) the order-as initiation permission', () => {
    const allowed: Role[] = [Role.DISTRIBUTOR_ADMIN, Role.OPERATIONS_MANAGER, Role.PLATFORM_ADMIN];
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

  it('gives team management only to DISTRIBUTOR_ADMIN (and the superset PLATFORM_ADMIN)', () => {
    for (const role of Object.values(Role)) {
      const has = ROLE_PERMISSIONS[role].includes(Permission.TEAM_MANAGE);
      expect(has).toBe(role === Role.DISTRIBUTOR_ADMIN || role === Role.PLATFORM_ADMIN);
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

  it('keeps company settings, the integration connection and the team Owner-only', () => {
    const ownerOnly = [Permission.SETTINGS_MANAGE, Permission.ACCOUNTING_MANAGE, Permission.TEAM_MANAGE];
    for (const role of Object.values(Role)) {
      for (const permission of ownerOnly) {
        expect(ROLE_PERMISSIONS[role].includes(permission)).toBe(role === Role.DISTRIBUTOR_ADMIN || role === Role.PLATFORM_ADMIN);
      }
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
