import { Reflector } from '@nestjs/core';
import { Permission } from '@wholo/types';
import { PERMISSIONS_KEY, RequirePermissions } from './permissions.decorator';

describe('RequirePermissions', () => {
  it('sets the required permissions as class metadata', () => {
    @RequirePermissions(Permission.PRICE_LISTS_MANAGE)
    class TestController {}

    const reflector = new Reflector();
    expect(reflector.get(PERMISSIONS_KEY, TestController)).toEqual([Permission.PRICE_LISTS_MANAGE]);
  });

  it('sets the required permissions as method metadata', () => {
    class TestController {
      @RequirePermissions(Permission.DELIVERY_READ)
      findAll() {}
    }

    const reflector = new Reflector();
    expect(reflector.get(PERMISSIONS_KEY, new TestController().findAll)).toEqual([Permission.DELIVERY_READ]);
  });

  it('supports multiple required permissions', () => {
    @RequirePermissions(Permission.ORDERS_READ, Permission.ORDERS_MANAGE)
    class TestController {}

    const reflector = new Reflector();
    expect(reflector.get(PERMISSIONS_KEY, TestController)).toEqual([
      Permission.ORDERS_READ,
      Permission.ORDERS_MANAGE,
    ]);
  });
});
