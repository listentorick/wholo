import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeliveryTokenSigner } from './delivery-token.signer';

describe('DeliveryTokenSigner', () => {
  let signer: DeliveryTokenSigner;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryTokenSigner,
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => Buffer.alloc(32, 7).toString('base64') },
        },
      ],
    }).compile();

    signer = module.get(DeliveryTokenSigner);
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

  it('rejects a token whose orderId was swapped but keeps a valid-looking signature from another order', () => {
    const otherToken = signer.sign('order-456');
    const [, otherSignature] = [otherToken.slice(0, otherToken.lastIndexOf('.')), otherToken.slice(otherToken.lastIndexOf('.') + 1)];
    expect(signer.verify(`order-123.${otherSignature}`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(signer.verify('not-a-real-token')).toBeNull();
    expect(signer.verify('')).toBeNull();
    expect(signer.verify('.justasignature')).toBeNull();
  });
});
