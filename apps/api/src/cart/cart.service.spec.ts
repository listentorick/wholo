import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CartOrderStatus, OrganisationType } from '@prisma/client';
import { CartService } from './cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { PriceResolutionService } from '../price-lists/price-resolution.service';

const DISTRIBUTOR_ID = 'dist-1';
const CUSTOMER_ID = 'cust-1';
const USER_ID = 'user-1';
const PRODUCT_ID = 'prod-1';
const CART_ID = 'cart-1';

function makeDistributor() {
  return { id: DISTRIBUTOR_ID };
}

function makeProduct(overrides: Partial<{ id: string; price: unknown; distributorId: string }> = {}) {
  return { id: PRODUCT_ID, price: { toFixed: () => '10.00' }, distributorId: DISTRIBUTOR_ID, ...overrides };
}

function makeCart(lines: unknown[] = []) {
  return {
    id: CART_ID,
    distributorId: DISTRIBUTOR_ID,
    customerId: CUSTOMER_ID,
    userId: USER_ID,
    status: CartOrderStatus.DRAFT,
    lines,
  };
}

function makeCartLine() {
  return {
    productId: PRODUCT_ID,
    quantity: 2,
    unitPrice: { toFixed: (n: number) => '10.00' },
    product: { id: PRODUCT_ID, name: 'Wine', sku: 'SKU-1' },
  };
}

describe('CartService', () => {
  let service: CartService;
  let prisma: jest.Mocked<PrismaService>;
  let priceResolution: jest.Mocked<PriceResolutionService>;

  beforeEach(async () => {
    const mockPrisma = {
      organisation: { findFirst: jest.fn() },
      tradeRelationship: { findFirst: jest.fn() },
      cartOrder: { upsert: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
      cartOrderLine: { upsert: jest.fn(), deleteMany: jest.fn() },
      product: { findFirst: jest.fn() },
    };

    const mockPriceResolution = {
      resolvePrice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PriceResolutionService, useValue: mockPriceResolution },
      ],
    }).compile();

    service = module.get(CartService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    priceResolution = module.get(PriceResolutionService) as jest.Mocked<PriceResolutionService>;
  });

  describe('getCart', () => {
    it('returns formatted cart for the given distributor/customer/user', async () => {
      const cart = makeCart([makeCartLine()]);
      (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
      (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(cart);

      const result = await service.getCart('dist-slug', CUSTOMER_ID, USER_ID);

      expect(prisma.organisation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ slug: 'dist-slug', type: OrganisationType.DISTRIBUTOR }) }),
      );
      expect(prisma.cartOrder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { distributorId_customerId_userId_status: { distributorId: DISTRIBUTOR_ID, customerId: CUSTOMER_ID, userId: USER_ID, status: CartOrderStatus.DRAFT } },
        }),
      );
      expect(prisma.cartOrder.upsert).not.toHaveBeenCalled();
      expect(result.orderId).toBe(CART_ID);
      expect(result.items).toHaveLength(1);
    });

    it('throws NotFoundException when distributor slug is unknown', async () => {
      (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getCart('bad-slug', CUSTOMER_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns empty cart when no lines exist', async () => {
      (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
      (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(makeCart([]));

      const result = await service.getCart('dist-slug', CUSTOMER_ID, USER_ID);

      expect(result.items).toHaveLength(0);
    });

    it('returns a synthesized empty cart without creating a row when no draft exists yet', async () => {
      (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
      (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getCart('dist-slug', CUSTOMER_ID, USER_ID);

      expect(result.orderId).toBeNull();
      expect(result.items).toHaveLength(0);
      expect(prisma.cartOrder.upsert).not.toHaveBeenCalled();
    });
  });

  describe('upsertItem', () => {
    const dto = { distributorSlug: 'dist-slug', productId: PRODUCT_ID, quantity: 2 };

    beforeEach(() => {
      (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue({ id: 'rel-1' });
      (prisma.cartOrder.upsert as jest.Mock).mockResolvedValue(makeCart());
      (prisma.cartOrder.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeCart([makeCartLine()]));
    });

    it('resolves price and upserts line when quantity > 0', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(makeProduct());
      (priceResolution.resolvePrice as jest.Mock).mockResolvedValue({
        unitPrice: { toFixed: () => '9.00' },
        priceListId: 'pl-1',
        priceListRuleId: 'plr-1',
      });

      await service.upsertItem(dto, CUSTOMER_ID, USER_ID);

      expect(priceResolution.resolvePrice).toHaveBeenCalledWith(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID, 2);
      expect(prisma.cartOrderLine.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderId_productId: { orderId: CART_ID, productId: PRODUCT_ID } },
          create: expect.objectContaining({ quantity: 2, resolvedPriceListId: 'pl-1' }),
        }),
      );
    });

    it('falls back to product base price when no price list rule matches', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(makeProduct());
      (priceResolution.resolvePrice as jest.Mock).mockResolvedValue(null);

      await service.upsertItem(dto, CUSTOMER_ID, USER_ID);

      expect(prisma.cartOrderLine.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ resolvedPriceListId: null, resolvedPriceListRuleId: null }),
        }),
      );
    });

    it('throws UnprocessableEntityException when no price is available at all', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(makeProduct({ price: null }));
      (priceResolution.resolvePrice as jest.Mock).mockResolvedValue(null);

      await expect(service.upsertItem(dto, CUSTOMER_ID, USER_ID)).rejects.toThrow(UnprocessableEntityException);
    });

    it('removes the line when quantity is 0', async () => {
      (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(makeCart());

      await service.upsertItem({ ...dto, quantity: 0 }, CUSTOMER_ID, USER_ID);

      expect(prisma.cartOrderLine.deleteMany).toHaveBeenCalledWith({
        where: { orderId: CART_ID, productId: PRODUCT_ID },
      });
      expect(prisma.cartOrderLine.upsert).not.toHaveBeenCalled();
    });

    it('no-ops without creating a cart when removing from a nonexistent cart', async () => {
      (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.upsertItem({ ...dto, quantity: 0 }, CUSTOMER_ID, USER_ID);

      expect(prisma.cartOrder.upsert).not.toHaveBeenCalled();
      expect(prisma.cartOrderLine.deleteMany).not.toHaveBeenCalled();
      expect(result.orderId).toBeNull();
      expect(result.items).toHaveLength(0);
    });

    it('throws NotFoundException when distributor slug is unknown', async () => {
      (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.upsertItem(dto, CUSTOMER_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when no active trade relationship exists', async () => {
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.upsertItem(dto, CUSTOMER_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when product does not belong to the distributor', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.upsertItem(dto, CUSTOMER_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when order-as distributorId does not match product distributorId', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(makeProduct({ distributorId: DISTRIBUTOR_ID }));

      await expect(
        service.upsertItem(dto, CUSTOMER_ID, USER_ID, 'other-dist-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('succeeds when order-as distributorId matches product distributorId', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(makeProduct({ distributorId: DISTRIBUTOR_ID }));
      (priceResolution.resolvePrice as jest.Mock).mockResolvedValue(null);

      await expect(
        service.upsertItem(dto, CUSTOMER_ID, USER_ID, DISTRIBUTOR_ID),
      ).resolves.toBeDefined();
    });
  });
});
