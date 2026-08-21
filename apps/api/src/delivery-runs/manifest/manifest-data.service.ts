import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DeliveryRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ManifestAddress, ManifestData, ManifestOrder } from './manifest-data.types';

const orderLineSelect = {
  id: true,
  productNameSnapshot: true,
  quantityOrdered: true,
} satisfies Prisma.OrderLineSelect;

const orderSelect = {
  id: true,
  orderNumber: true,
  deliveryAddressSnapshot: true,
  customerReference: true,
  notes: true,
  customer: { select: { name: true } },
  lines: { select: orderLineSelect, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderSelect;

@Injectable()
export class ManifestDataService {
  constructor(private prisma: PrismaService) {}

  async getManifestData(distributorId: string, runId: string): Promise<ManifestData> {
    const run = await this.prisma.deliveryRun.findFirst({
      where: { id: runId, distributorId },
      include: {
        orders: {
          where: { removedAt: null },
          orderBy: [{ deliverySequence: 'asc' }, { assignedAt: 'asc' }, { id: 'asc' }],
          include: { order: { select: orderSelect } },
        },
      },
    });
    if (!run) throw new NotFoundException('Delivery run not found');
    if (run.status !== DeliveryRunStatus.READY) {
      throw new UnprocessableEntityException('Run must be marked ready before a driver manifest can be generated');
    }
    if (run.orders.length === 0) {
      throw new UnprocessableEntityException('Run has no orders to include in a manifest');
    }

    const distributor = await this.prisma.organisation.findUnique({
      where: { id: distributorId },
      select: { name: true },
    });

    const orders: ManifestOrder[] = run.orders.map((runOrder, index) => {
      const { order } = runOrder;
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        stopNumber: index + 1,
        customerName: order.customer.name,
        address: parseAddress(order.deliveryAddressSnapshot),
        deliveryInstructions: order.notes,
        customerReference: order.customerReference,
        lines: order.lines.map((line) => ({
          id: line.id,
          productName: line.productNameSnapshot,
          quantity: line.quantityOrdered,
        })),
      };
    });

    return {
      runId: run.id,
      runName: run.name,
      runReference: deriveRunReference(run.id, run.deliveryDate),
      deliveryDate: toIsoDate(run.deliveryDate),
      driverName: run.driverName,
      distributorName: distributor?.name ?? '',
      orders,
    };
  }
}

// Display-only — never stored. DeliveryRun has no dedicated reference
// column, so this derives a human-scannable identifier from data that
// already exists: the delivery date gives immediate context, the last 6
// characters of the run id give enough entropy to disambiguate same-day
// runs without printing the whole opaque cuid.
export function deriveRunReference(runId: string, deliveryDate: Date): string {
  return `RUN-${toIsoDate(deliveryDate)}-${runId.slice(-6).toUpperCase()}`;
}

export function parseAddress(snapshot: Prisma.JsonValue): ManifestAddress {
  const empty: ManifestAddress = {
    line1: null, line2: null, city: null, state: null, postcode: null, country: null,
  };
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return empty;
  const s = snapshot as Record<string, unknown>;
  const field = (key: string) => (typeof s[key] === 'string' ? (s[key] as string) : null);
  return {
    line1: field('line1'),
    line2: field('line2'),
    city: field('city'),
    state: field('state'),
    postcode: field('postcode'),
    country: field('country'),
  };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
