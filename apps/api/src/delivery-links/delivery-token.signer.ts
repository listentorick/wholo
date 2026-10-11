import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createPublicKey, KeyObject, sign, verify } from 'crypto';

const ALGORITHM = 'ed25519';
const SIGNATURE_BYTES = 64;

// Signs/verifies a durable, stateless pointer to an Order.id — never minted,
// stored, or expired (see the schema comment above OrderDeliveryOutcome for
// why: a driver can't obtain a replacement QR code in the field, so the link
// must keep resolving indefinitely until an outcome is recorded). The signed
// payload is the internal Order.id (already a non-sequential cuid), never the
// human-facing orderNumber.
//
// The signature is Ed25519 (ADR-076). Only this service holds the private
// key, so only it can create a link; anything given a public key — the driver
// BFF checks every request at the edge — can verify one but never mint one.
//
// DELIVERY_TOKEN_PUBLIC_KEYS is a list so a key can be replaced without
// killing the links already printed: during a changeover it holds the new
// key and the previous one, and a token is valid if any of them verifies it.
// See docs/runbook/keys-and-certificates.md.
@Injectable()
export class DeliveryTokenSigner {
  private readonly privateKey: KeyObject;
  private readonly publicKeys: KeyObject[];

  constructor(config: ConfigService) {
    this.privateKey = parsePrivateKey(config.getOrThrow<string>('DELIVERY_TOKEN_PRIVATE_KEY'));
    this.publicKeys = parsePublicKeys(config.getOrThrow<string>('DELIVERY_TOKEN_PUBLIC_KEYS'));

    // A private key whose public half nobody trusts would print manifests
    // full of links that never open — refuse to start instead.
    const ownPublicKey = spki(createPublicKey(this.privateKey));
    if (!this.publicKeys.some((key) => spki(key).equals(ownPublicKey))) {
      throw new Error('DELIVERY_TOKEN_PUBLIC_KEYS does not include the public half of DELIVERY_TOKEN_PRIVATE_KEY');
    }
  }

  // Deterministic: the same order always produces the same token, so
  // reprinting a manifest reproduces an identical QR code.
  sign(orderId: string): string {
    return `${orderId}.${sign(null, Buffer.from(orderId), this.privateKey).toString('base64url')}`;
  }

  // Returns the orderId if the token is well-formed and its signature is
  // valid, otherwise null — callers should treat every failure mode
  // (malformed, forged, unknown) identically (NotFoundException), never
  // distinguishing them in the response.
  verify(token: string): string | null {
    return verifyDeliveryToken(token, this.publicKeys);
  }
}

function verifyDeliveryToken(token: string, publicKeys: KeyObject[]): string | null {
  const separatorIndex = token.lastIndexOf('.');
  if (separatorIndex <= 0) return null;

  const orderId = token.slice(0, separatorIndex);
  const encodedSignature = token.slice(separatorIndex + 1);
  const signature = Buffer.from(encodedSignature, 'base64url');
  // Exactly one spelling per signature: Buffer.from ignores stray characters
  // and trailing bits, which would otherwise let many strings decode to it.
  if (signature.length !== SIGNATURE_BYTES || signature.toString('base64url') !== encodedSignature) return null;

  const payload = Buffer.from(orderId);
  return publicKeys.some((key) => verify(null, payload, key, signature)) ? orderId : null;
}

function parsePrivateKey(value: string): KeyObject {
  if (!value.trim()) throw new Error('DELIVERY_TOKEN_PRIVATE_KEY is empty');
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: Buffer.from(value.trim(), 'base64'), format: 'der', type: 'pkcs8' });
  } catch {
    // Never echo the value — it is the secret.
    throw new Error('DELIVERY_TOKEN_PRIVATE_KEY is not a base64 PKCS#8 private key');
  }
  if (key.asymmetricKeyType !== ALGORITHM) throw new Error('DELIVERY_TOKEN_PRIVATE_KEY is not an Ed25519 key');
  return key;
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

function spki(key: KeyObject): Buffer {
  return key.export({ type: 'spki', format: 'der' });
}
