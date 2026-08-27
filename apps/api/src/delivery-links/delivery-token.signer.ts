import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

// Signs/verifies a durable, stateless pointer to an Order.id — never minted,
// stored, or expired (see the schema comment above OrderDeliveryOutcome for
// why: a driver can't obtain a replacement QR code in the field, so the link
// must keep resolving indefinitely until an outcome is recorded). Forgery is
// infeasible without DELIVERY_TOKEN_SIGNING_KEY; the signed payload is the
// internal Order.id (already a non-sequential cuid), never the human-facing
// orderNumber.
@Injectable()
export class DeliveryTokenSigner {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('DELIVERY_TOKEN_SIGNING_KEY'), 'base64');
  }

  sign(orderId: string): string {
    return `${orderId}.${this.hmac(orderId)}`;
  }

  // Returns the orderId if the token is well-formed and its signature is
  // valid, otherwise null — callers should treat every failure mode
  // (malformed, forged, unknown) identically (NotFoundException), never
  // distinguishing them in the response.
  verify(token: string): string | null {
    const separatorIndex = token.lastIndexOf('.');
    if (separatorIndex <= 0) return null;

    const orderId = token.slice(0, separatorIndex);
    const providedSignature = token.slice(separatorIndex + 1);
    const expectedSignature = this.hmac(orderId);

    const provided = Buffer.from(providedSignature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

    return orderId;
  }

  private hmac(orderId: string): string {
    return createHmac('sha256', this.key).update(orderId).digest('base64url');
  }
}
