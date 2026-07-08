import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { TokenEncryptionService } from './token-encryption.service';

const validKey = randomBytes(32).toString('base64');

const makeConfig = (key: string) => ({ getOrThrow: jest.fn().mockReturnValue(key) });

async function buildService(key: string): Promise<TokenEncryptionService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TokenEncryptionService,
      { provide: ConfigService, useValue: makeConfig(key) },
    ],
  }).compile();
  return module.get(TokenEncryptionService);
}

describe('TokenEncryptionService', () => {
  it('round-trips a plaintext string through encrypt/decrypt', async () => {
    const service = await buildService(validKey);
    const plaintext = JSON.stringify({ accessToken: 'abc', refreshToken: 'def' });

    const ciphertext = service.encrypt(plaintext);
    expect(ciphertext).not.toEqual(plaintext);
    expect(service.decrypt(ciphertext)).toEqual(plaintext);
  });

  it('throws when the configured key is not 32 bytes', async () => {
    await expect(buildService(Buffer.from('too-short').toString('base64'))).rejects.toThrow(
      /must decode to 32 bytes/,
    );
  });

  it('throws on tampered ciphertext (auth tag mismatch)', async () => {
    const service = await buildService(validKey);
    const ciphertext = service.encrypt('secret-value');
    const [iv, authTag, payload] = ciphertext.split(':');
    const tampered = [iv, authTag, Buffer.from('garbage').toString('base64')].join(':');
    void payload;

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('throws when decrypting with the wrong key', async () => {
    const serviceA = await buildService(validKey);
    const serviceB = await buildService(randomBytes(32).toString('base64'));
    const ciphertext = serviceA.encrypt('secret-value');

    expect(() => serviceB.decrypt(ciphertext)).toThrow();
  });
});
