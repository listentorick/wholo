import { ConflictException, GoneException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  ActorType,
  DeliveryDropMethod,
  DeliveryOutcomeType,
  OrderDeliveryOutcome,
  OrderStatus,
  Prisma,
  UnableToDeliverReason,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { DeliveryTokenSigner } from './delivery-token.signer';
import { DeliveryPhotoService, DeliveryPhotoDto } from './delivery-photo.service';
import { SubmitOutcomeDto } from './dto/submit-outcome.dto';
import { parseAddress } from '../delivery-runs/manifest/manifest-data.service';
import { DeliveryLinkOrderDto } from './delivery-link.types';

const orderSelect = {
  id: true,
  distributorId: true,
  traderCustomerId: true,
  placedByUserId: true,
  isOrderedByDelegate: true,
  orderNumber: true,
  status: true,
  deliveryAddressSnapshot: true,
  notes: true,
  customer: { select: { name: true, phone: true } },
  distributor: { select: { name: true } },
  lines: { select: { productNameSnapshot: true, quantityOrdered: true }, orderBy: { id: 'asc' as const } },
} satisfies Prisma.OrderSelect;

type OrderForDeliveryLink = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

const NON_DELIVERABLE_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REJECTED];

// The endpoint is public and unauthenticated — cap the stored signature blob
// under Express's default 100 KB JSON body limit. A real handwritten signature
// serialises to a few KB (signature_pad simplifies the curve); anything near
// this ceiling is abuse, not a signature.
const MAX_SIGNATURE_BYTES = 90_000;

// Stable, key-sorted JSON — used to compare a stored jsonb value (keys reordered
// by the round-trip) against an incoming DTO (keys in declaration order).
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

@Injectable()
export class DeliveryLinksService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private outbox: OutboxService,
    private signer: DeliveryTokenSigner,
    private deliveryPhoto: DeliveryPhotoService,
  ) {}

  async uploadPhoto(rawToken: string, file: Express.Multer.File): Promise<DeliveryPhotoDto> {
    const order = await this.resolveOrder(rawToken);
    return this.deliveryPhoto.uploadPhoto(order, file.buffer, file.mimetype, file.size);
  }

  async deletePhoto(rawToken: string, photoId: string): Promise<void> {
    const order = await this.resolveOrder(rawToken);
    return this.deliveryPhoto.deletePhoto(order, photoId);
  }

  async getOrder(rawToken: string): Promise<DeliveryLinkOrderDto> {
    const order = await this.resolveOrder(rawToken);
    const outcome = await this.prisma.orderDeliveryOutcome.findUnique({ where: { orderId: order.id } });
    if (!outcome) return this.toPendingDto(order);
    const driverName = await this.getDriverName(order.id);
    return this.toReadOnlyDto(order, outcome, driverName);
  }

  async submitOutcome(rawToken: string, dto: SubmitOutcomeDto): Promise<DeliveryLinkOrderDto> {
    const order = await this.resolveOrder(rawToken);

    if (dto.outcome === DeliveryOutcomeType.UNABLE_TO_DELIVER && !dto.unableReason) {
      throw new UnprocessableEntityException('unableReason is required when outcome is UNABLE_TO_DELIVER');
    }
    if (dto.unableReason === UnableToDeliverReason.OTHER && !dto.unableReasonNote) {
      throw new UnprocessableEntityException('unableReasonNote is required when unableReason is OTHER');
    }
    if (dto.outcome === DeliveryOutcomeType.DELIVERED && !dto.dropMethod) {
      throw new UnprocessableEntityException('dropMethod is required when outcome is DELIVERED');
    }
    if (dto.dropMethod === DeliveryDropMethod.HANDED_TO_PERSON && (!dto.recipientName || !dto.signature)) {
      throw new UnprocessableEntityException(
        'recipientName and signature are required when dropMethod is HANDED_TO_PERSON',
      );
    }
    if (dto.signature && JSON.stringify(dto.signature).length > MAX_SIGNATURE_BYTES) {
      throw new UnprocessableEntityException('signature payload is too large');
    }

    const photoIds = dto.photoIds ?? [];
    const loc = dto.location;
    const locationUnavailable = loc?.unavailable ?? false;

    const driverName = await this.getDriverName(order.id);
    const isDelivered = dto.outcome === DeliveryOutcomeType.DELIVERED;
    const newStatus = isDelivered ? OrderStatus.DELIVERED : OrderStatus.DELIVERY_FAILED;

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const created = await tx.orderDeliveryOutcome.create({
          data: {
            orderId: order.id,
            outcome: dto.outcome,
            recipientName: dto.recipientName,
            notes: dto.notes,
            unableReason: dto.unableReason,
            unableReasonNote: dto.unableReasonNote,
            dropMethod: dto.dropMethod,
            signature: dto.signature ? (dto.signature as unknown as Prisma.InputJsonValue) : undefined,
            capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : undefined,
            latitude: locationUnavailable ? null : (loc?.latitude ?? null),
            longitude: locationUnavailable ? null : (loc?.longitude ?? null),
            locationAccuracyM: locationUnavailable ? null : (loc?.accuracyM ?? null),
            locationCapturedAt: locationUnavailable || !loc?.capturedAt ? null : new Date(loc.capturedAt),
            locationUnavailable,
          },
        });

        // Link the eagerly-uploaded proof photos. A count mismatch means a
        // supplied id isn't an unlinked photo for this order — reject rather
        // than silently drop it.
        if (photoIds.length > 0) {
          const { count } = await tx.orderDeliveryPhoto.updateMany({
            where: { id: { in: photoIds }, orderId: order.id, outcomeId: null },
            data: { outcomeId: created.id },
          });
          if (count !== photoIds.length) {
            throw new UnprocessableEntityException('one or more photos are not attached to this delivery');
          }
        }
        // Audit trail is the real safeguard against misuse here (see the
        // plan's Context section) — not something the token scheme itself
        // needs to prevent. Written in the same transaction as the create,
        // per ADR-054's discipline (audit rows only ever land alongside the
        // state change they describe).
        await this.audit.record(tx, {
          distributorId: order.distributorId,
          entityType: 'ORDER',
          entityId: order.id,
          action: 'DELIVERY_OUTCOME_RECORDED',
          actorType: ActorType.SYSTEM, // no authenticated actor exists on this path
          summary: `Delivery outcome recorded via QR link: ${dto.outcome}`,
          changes: {
            outcome: dto.outcome,
            dropMethod: dto.dropMethod ?? null,
            photoCount: photoIds.length,
            locationCaptured: !locationUnavailable && loc?.latitude != null,
            submittedViaQrToken: true,
          },
        });

        // Order status transition + notification, same transaction as the
        // outcome write — see ADR on order status (Delivered means "we kept
        // our end of the bargain", deliberately distinct from Completed,
        // which implies payment too). Mirrors OrderPlacedNotificationService's
        // event shape: minimal IDs + a small snapshot, recipients resolved
        // live by the notification handler, not carried here.
        await tx.order.update({ where: { id: order.id }, data: { status: newStatus } });
        await this.outbox.writeEvent(tx, 'Order', order.id, isDelivered ? 'OrderDelivered' : 'OrderDeliveryFailed', {
          orderId: order.id,
          distributorId: order.distributorId,
          traderCustomerId: order.traderCustomerId,
          placedByUserId: order.placedByUserId,
          isOrderedByDelegate: order.isOrderedByDelegate,
          orderNumber: order.orderNumber,
          driverName,
          recordedAt: created.recordedAt.toISOString(),
          unableReason: dto.unableReason ?? null,
        });

        return created;
      });
      return this.toReadOnlyDto(order, outcome, driverName);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Lost a race, or a genuine retry — a second row was never actually created.
        const existing = await this.prisma.orderDeliveryOutcome.findUniqueOrThrow({
          where: { orderId: order.id },
          include: { photos: { select: { id: true } } },
        });
        if (this.matchesExisting(existing, dto)) return this.toReadOnlyDto(order, existing, driverName); // idempotent retry
        throw new ConflictException('This delivery has already been recorded');
      }
      throw e;
    }
  }

  private async getDriverName(orderId: string): Promise<string | null> {
    const activeAllocation = await this.prisma.deliveryRunOrder.findFirst({
      where: { activeOrderId: orderId },
      include: { run: { select: { driverName: true } } },
    });
    return activeAllocation?.run.driverName ?? null;
  }

  private async resolveOrder(rawToken: string): Promise<OrderForDeliveryLink> {
    const orderId = this.signer.verify(rawToken);
    // Every failure mode (malformed, forged, unknown order) is indistinguishable
    // from the caller's point of view — never leak which one it was.
    if (!orderId) throw new NotFoundException();

    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
    if (!order || NON_DELIVERABLE_STATUSES.includes(order.status)) throw new GoneException();
    return order;
  }

  private matchesExisting(
    existing: OrderDeliveryOutcome & { photos: { id: string }[] },
    dto: SubmitOutcomeDto,
  ): boolean {
    const loc = dto.location;
    const locUnavailable = loc?.unavailable ?? false;
    const dtoPhotoIds = [...(dto.photoIds ?? [])].sort();
    const existingPhotoIds = existing.photos.map((p) => p.id).sort();

    return (
      existing.outcome === dto.outcome
      && (existing.recipientName ?? null) === (dto.recipientName ?? null)
      && (existing.notes ?? null) === (dto.notes ?? null)
      && (existing.unableReason ?? null) === (dto.unableReason ?? null)
      && (existing.unableReasonNote ?? null) === (dto.unableReasonNote ?? null)
      && (existing.dropMethod ?? null) === (dto.dropMethod ?? null)
      && (existing.capturedAt?.toISOString() ?? null) === (dto.capturedAt ? new Date(dto.capturedAt).toISOString() : null)
      // Compare with a key-order-independent canonical form: jsonb round-trips
      // reorder object keys, and the DTO instance keeps declaration order, so a
      // plain JSON.stringify would spuriously flag two identical signatures as
      // a conflict under a concurrent retry.
      && canonicalJson(existing.signature ?? null) === canonicalJson(dto.signature ?? null)
      && existing.locationUnavailable === locUnavailable
      && (existing.latitude ?? null) === (locUnavailable ? null : (loc?.latitude ?? null))
      && (existing.longitude ?? null) === (locUnavailable ? null : (loc?.longitude ?? null))
      && (existing.locationAccuracyM ?? null) === (locUnavailable ? null : (loc?.accuracyM ?? null))
      && (existing.locationCapturedAt?.toISOString() ?? null)
        === (locUnavailable || !loc?.capturedAt ? null : new Date(loc.capturedAt).toISOString())
      && canonicalJson(dtoPhotoIds) === canonicalJson(existingPhotoIds)
    );
  }

  private toPendingDto(order: OrderForDeliveryLink): DeliveryLinkOrderDto {
    return {
      orderNumber: order.orderNumber,
      distributorName: order.distributor.name,
      customerName: order.customer.name,
      address: parseAddress(order.deliveryAddressSnapshot),
      customerPhone: order.customer.phone,
      deliveryInstructions: order.notes,
      lines: order.lines.map((line) => ({ productName: line.productNameSnapshot, quantity: line.quantityOrdered })),
      state: 'PENDING',
    };
  }

  private toReadOnlyDto(order: OrderForDeliveryLink, outcome: OrderDeliveryOutcome, driverName: string | null): DeliveryLinkOrderDto {
    // PRD §13 — the read-only confirmation is deliberately minimal: order
    // number, outcome, date/time, driver. No address, contact, or product
    // detail once submitted.
    return {
      orderNumber: order.orderNumber,
      distributorName: order.distributor.name,
      customerName: order.customer.name,
      address: { line1: null, line2: null, city: null, state: null, postcode: null, country: null },
      customerPhone: null,
      deliveryInstructions: null,
      lines: [],
      state: 'SUBMITTED',
      outcome: {
        outcome: outcome.outcome,
        recordedAt: outcome.recordedAt.toISOString(),
        driverName,
      },
    };
  }
}
