import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, KeyObject, verify } from 'crypto';

const ALGORITHM = 'ed25519';
const SIGNATURE_BYTES = 64;

// Checks a delivery-link token's signature at the edge, before this BFF reads
// a request body or calls apps/api (ADR-076). It holds public keys only: it
// can tell a real link from a forged one but can never create one — signing
// lives in apps/api's DeliveryTokenSigner, and must not be copied here.
//
// The verify half below deliberately mirrors that class rather than sharing
// it, so no signing code is ever built into this image. A token is
// `<orderId>.<base64url Ed25519 signature of orderId>`, valid if any listed
// key verifies it (the list holds two keys while one is being replaced — see
// docs/runbook/keys-and-certificates.md).
//
// This only proves the link is genuine. Whether its order can still be
// delivered is apps/api's check; this service has no database.
@Injectable()
export class DeliveryTokenVerifier {
  private readonly publicKeys: KeyObject[];

  constructor(config: ConfigService) {
    this.publicKeys = parsePublicKeys(config.getOrThrow<string>('DELIVERY_TOKEN_PUBLIC_KEYS'));
  }

  // The orderId if the token is well-formed and genuinely signed, else null.
  verify(token: string): string | null {
    const separatorIndex = token.lastIndexOf('.');
    if (separatorIndex <= 0) return null;

    const orderId = token.slice(0, separatorIndex);
    const encodedSignature = token.slice(separatorIndex + 1);
    const signature = Buffer.from(encodedSignature, 'base64url');
    // Exactly one spelling per signature: Buffer.from ignores stray characters
    // and trailing bits, which would otherwise let many strings decode to it.
    if (signature.length !== SIGNATURE_BYTES || signature.toString('base64url') !== encodedSignature) return null;

    const payload = Buffer.from(orderId);
    return this.publicKeys.some((key) => verify(null, payload, key, signature)) ? orderId : null;
  }
}

function parsePublicKeys(value: string): KeyObject[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) throw new Error('DELIVERY_TOKEN_PUBLIC_KEYS is empty');

  return entries.map((entry, index) => {
    let key: KeyObject;
    try {
      key = createPublicKey({ key: Buffer.from(entry, 'base64'), format: 'der', type: 'spki' });
    } catch {
      throw new Error(`DELIVERY_TOKEN_PUBLIC_KEYS entry ${index + 1} is not a base64 SPKI public key`);
    }
    if (key.asymmetricKeyType !== ALGORITHM) {
      throw new Error(`DELIVERY_TOKEN_PUBLIC_KEYS entry ${index + 1} is not an Ed25519 key`);
    }
    return key;
  });
}
