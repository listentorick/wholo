import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const TOKEN_BYTES = 16;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

// The secret a delivery-link QR code carries (ADR-076): 128 bits from the OS's
// cryptographically secure source, base64url — never derived from the order
// id, order number, time or a counter. It is a bearer secret: whoever holds
// it can open that one delivery, so it is unguessable rather than signed.
//
// Stored on Order.deliveryLinkToken, set the first time a manifest including
// the order is printed and never changed afterwards, so reprinting a manifest
// reproduces identical QR codes and a link keeps working until the delivery
// is recorded (ADR-059: a driver can't get a replacement code in the field).
@Injectable()
export class DeliveryLinkTokensService {
  constructor(private prisma: PrismaService) {}

  static generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  // Lets a caller reject junk before it reaches the database.
  static isWellFormed(token: string): boolean {
    return TOKEN_PATTERN.test(token);
  }

  // Returns every order's token, creating any that are missing. The
  // `deliveryLinkToken: null` condition means two prints racing can't
  // overwrite each other — the second write matches nothing and both read
  // back the first one's token.
  async ensureFor(orderIds: string[]): Promise<Map<string, string>> {
    const existing = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, deliveryLinkToken: true },
    });

    const missing = existing.filter((order) => !order.deliveryLinkToken);
    if (missing.length === 0) return toMap(existing);

    await this.prisma.$transaction(
      missing.map((order) =>
        this.prisma.order.updateMany({
          where: { id: order.id, deliveryLinkToken: null },
          data: { deliveryLinkToken: DeliveryLinkTokensService.generate() },
        }),
      ),
    );

    return toMap(
      await this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, deliveryLinkToken: true },
      }),
    );
  }
}

function toMap(orders: { id: string; deliveryLinkToken: string | null }[]): Map<string, string> {
  return new Map(
    orders.flatMap((order) => (order.deliveryLinkToken ? [[order.id, order.deliveryLinkToken] as const] : [])),
  );
}
