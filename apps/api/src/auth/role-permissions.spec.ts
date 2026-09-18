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

  it('gives only DISTRIBUTOR_ADMIN (and the superset PLATFORM_ADMIN) the order-as initiation permission', () => {
    for (const role of Object.values(Role)) {
      if (role === Role.DISTRIBUTOR_ADMIN || role === Role.PLATFORM_ADMIN) {
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

  it('gives DRIVER only delivery permissions', () => {
    expect(ROLE_PERMISSIONS[Role.DRIVER].sort()).toEqual([Permission.DELIVERY_READ, Permission.DELIVERY_MANAGE].sort());
  });
});
