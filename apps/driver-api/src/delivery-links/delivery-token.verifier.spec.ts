import { ConfigService } from '@nestjs/config';
import { createHmac, generateKeyPairSync, KeyObject, sign } from 'crypto';
import { DeliveryTokenVerifier } from './delivery-token.verifier';

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
}

// What apps/api's DeliveryTokenSigner produces.
function tokenFor(orderId: string, privateKey: KeyObject): string {
  return `${orderId}.${sign(null, Buffer.from(orderId), privateKey).toString('base64url')}`;
}

function verifierWith(publicKeys: string | undefined): DeliveryTokenVerifier {
  const config = {
    getOrThrow: (name: string) => {
      if (publicKeys === undefined) throw new Error(`Configuration key "${name}" does not exist`);
      return publicKeys;
    },
  } as unknown as ConfigService;
  return new DeliveryTokenVerifier(config);
}

describe('DeliveryTokenVerifier', () => {
  const current = keyPair();
  const previous = keyPair();
  const verifier = verifierWith(current.publicKey);

  it('returns the orderId for a genuinely signed token', () => {
    expect(verifier.verify(tokenFor('order-123', current.privateKey))).toBe('order-123');
  });

  it('rejects a tampered signature', () => {
    const token = tokenFor('order-123', current.privateKey);
    expect(verifier.verify(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`)).toBeNull();
  });

  it('rejects a signature lifted from another order', () => {
    const other = tokenFor('order-456', current.privateKey);
    expect(verifier.verify(`order-123.${other.slice(other.lastIndexOf('.') + 1)}`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifier.verify('not-a-real-token')).toBeNull();
    expect(verifier.verify('')).toBeNull();
    expect(verifier.verify('.justasignature')).toBeNull();
    expect(verifier.verify('order-123.')).toBeNull();
  });

  it('rejects a token signed with a key that is not in the list', () => {
    expect(verifier.verify(tokenFor('order-123', previous.privateKey))).toBeNull();
  });

  it('rejects a token in the old HMAC format', () => {
    const hmac = createHmac('sha256', Buffer.alloc(32, 7)).update('order-123').digest('base64url');
    expect(verifier.verify(`order-123.${hmac}`)).toBeNull();
  });

  it('accepts a token from any key in the list, so a key can be replaced without killing printed links', () => {
    const during = verifierWith(`${current.publicKey}, ${previous.publicKey}`);
    expect(during.verify(tokenFor('order-123', previous.privateKey))).toBe('order-123');
    expect(during.verify(tokenFor('order-456', current.privateKey))).toBe('order-456');
  });

  describe('refuses to start', () => {
    it.each([
      ['the public keys are not set', undefined],
      ['the public keys are empty', ''],
      ['the list holds only separators', ' , '],
      ['an entry is not a key', `${current.publicKey},bm90IGEga2V5`],
    ])('when %s', (_case, value) => {
      expect(() => verifierWith(value)).toThrow();
    });

    it('when a key is another algorithm', () => {
      const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
      expect(() => verifierWith(rsa.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'))).toThrow(/Ed25519/);
    });
  });
});
