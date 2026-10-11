import { ConfigService } from '@nestjs/config';
import { createHmac, generateKeyPairSync } from 'crypto';
import { DeliveryTokenSigner } from './delivery-token.signer';

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

function signerWith(env: Record<string, string | undefined>): DeliveryTokenSigner {
  const config = {
    getOrThrow: (name: string) => {
      const value = env[name];
      if (value === undefined) throw new Error(`Configuration key "${name}" does not exist`);
      return value;
    },
  } as unknown as ConfigService;
  return new DeliveryTokenSigner(config);
}

describe('DeliveryTokenSigner', () => {
  const current = keyPair();
  const previous = keyPair();
  let signer: DeliveryTokenSigner;

  beforeEach(() => {
    signer = signerWith({ DELIVERY_TOKEN_PRIVATE_KEY: current.privateKey, DELIVERY_TOKEN_PUBLIC_KEYS: current.publicKey });
  });

  it('round-trips: signing then verifying returns the original orderId', () => {
    const token = signer.sign('order-123');
    expect(signer.verify(token)).toBe('order-123');
  });

  it('is deterministic — signing the same orderId twice produces the same token', () => {
    expect(signer.sign('order-123')).toBe(signer.sign('order-123'));
  });

  it('produces different tokens for different orders', () => {
    expect(signer.sign('order-123')).not.toBe(signer.sign('order-456'));
  });

  it('rejects a token with a tampered signature', () => {
    const token = signer.sign('order-123');
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(signer.verify(tampered)).toBeNull();
  });

  it('rejects a token whose orderId was swapped but keeps a valid signature from another order', () => {
    const otherToken = signer.sign('order-456');
    const otherSignature = otherToken.slice(otherToken.lastIndexOf('.') + 1);
    expect(signer.verify(`order-123.${otherSignature}`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(signer.verify('not-a-real-token')).toBeNull();
    expect(signer.verify('')).toBeNull();
    expect(signer.verify('.justasignature')).toBeNull();
    expect(signer.verify('order-123.')).toBeNull();
  });

  it('accepts only one spelling of a signature', () => {
    const token = signer.sign('order-123');
    expect(signer.verify(`${token}=`)).toBeNull();
    expect(signer.verify(`${token} `)).toBeNull();
  });

  it('rejects a token signed with a key that is not in the list', () => {
    const stranger = keyPair();
    const other = signerWith({ DELIVERY_TOKEN_PRIVATE_KEY: stranger.privateKey, DELIVERY_TOKEN_PUBLIC_KEYS: stranger.publicKey });
    expect(signer.verify(other.sign('order-123'))).toBeNull();
  });

  it('rejects a token in the old HMAC format', () => {
    const hmac = createHmac('sha256', Buffer.alloc(32, 7)).update('order-123').digest('base64url');
    expect(signer.verify(`order-123.${hmac}`)).toBeNull();
  });

  describe('replacing the key', () => {
    it('still accepts links signed with the previous key while it stays in the list', () => {
      const before = signerWith({ DELIVERY_TOKEN_PRIVATE_KEY: previous.privateKey, DELIVERY_TOKEN_PUBLIC_KEYS: previous.publicKey });
      const printedBefore = before.sign('order-123');

      const during = signerWith({
        DELIVERY_TOKEN_PRIVATE_KEY: current.privateKey,
        DELIVERY_TOKEN_PUBLIC_KEYS: `${current.publicKey}, ${previous.publicKey}`,
      });

      expect(during.verify(printedBefore)).toBe('order-123');
      expect(during.verify(during.sign('order-456'))).toBe('order-456');
    });

    it('stops accepting them once the previous key is removed', () => {
      const before = signerWith({ DELIVERY_TOKEN_PRIVATE_KEY: previous.privateKey, DELIVERY_TOKEN_PUBLIC_KEYS: previous.publicKey });
      expect(signer.verify(before.sign('order-123'))).toBeNull();
    });
  });

  describe('refuses to start', () => {
    it.each([
      ['the private key is not set', { DELIVERY_TOKEN_PUBLIC_KEYS: current.publicKey }],
      ['the public keys are not set', { DELIVERY_TOKEN_PRIVATE_KEY: current.privateKey }],
      ['the private key is empty', { DELIVERY_TOKEN_PRIVATE_KEY: '', DELIVERY_TOKEN_PUBLIC_KEYS: current.publicKey }],
      ['the public keys are empty', { DELIVERY_TOKEN_PRIVATE_KEY: current.privateKey, DELIVERY_TOKEN_PUBLIC_KEYS: ' , ' }],
      ['the private key is not a key', { DELIVERY_TOKEN_PRIVATE_KEY: 'bm90IGEga2V5', DELIVERY_TOKEN_PUBLIC_KEYS: current.publicKey }],
      ['a public key is not a key', { DELIVERY_TOKEN_PRIVATE_KEY: current.privateKey, DELIVERY_TOKEN_PUBLIC_KEYS: `${current.publicKey},bm90IGEga2V5` }],
      [
        'the old 32-byte HMAC secret is supplied as the private key',
        { DELIVERY_TOKEN_PRIVATE_KEY: Buffer.alloc(32, 7).toString('base64'), DELIVERY_TOKEN_PUBLIC_KEYS: current.publicKey },
      ],
      [
        'the public half of the private key is not in the list',
        { DELIVERY_TOKEN_PRIVATE_KEY: current.privateKey, DELIVERY_TOKEN_PUBLIC_KEYS: previous.publicKey },
      ],
    ])('when %s', (_case, env) => {
      expect(() => signerWith(env)).toThrow();
    });

    it('when the key is another algorithm', () => {
      const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const rsaPublic = rsa.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
      expect(() =>
        signerWith({ DELIVERY_TOKEN_PRIVATE_KEY: current.privateKey, DELIVERY_TOKEN_PUBLIC_KEYS: `${current.publicKey},${rsaPublic}` }),
      ).toThrow(/Ed25519/);
    });

    it('without putting the private key in the error', () => {
      const secret = 'c2VjcmV0LXZhbHVlLXRoYXQtbXVzdC1ub3QtbGVhaw==';
      expect(() => signerWith({ DELIVERY_TOKEN_PRIVATE_KEY: secret, DELIVERY_TOKEN_PUBLIC_KEYS: current.publicKey })).toThrow(
        expect.objectContaining({ message: expect.not.stringContaining(secret) }),
      );
    });
  });
});
