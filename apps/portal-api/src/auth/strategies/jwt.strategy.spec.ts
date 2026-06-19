import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn().mockReturnValue(jest.fn()),
}));

const mockConfig = {
  get: jest.fn((key: string, fallback?: string) => fallback ?? ''),
};

const mockRequest = (bearer?: string) =>
  ({ headers: { authorization: bearer ? `Bearer ${bearer}` : undefined } }) as any;

describe('JwtStrategy (portal-api)', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('validate', () => {
    it('returns sub, email, and raw bearer token', async () => {
      const req = mockRequest('my-bearer-token');
      const result = await strategy.validate(req, { sub: 'kc-sub-abc', email: 'peter@blackbird.com' });

      expect(result).toEqual({
        sub: 'kc-sub-abc',
        email: 'peter@blackbird.com',
        token: 'my-bearer-token',
      });
    });

    it('strips Bearer prefix from token', async () => {
      const req = mockRequest('raw-token-value');
      const result = await strategy.validate(req, { sub: 'kc-sub-xyz' });
      expect(result.token).toBe('raw-token-value');
    });

    it('sets token to undefined when no authorization header', async () => {
      const req = mockRequest();
      const result = await strategy.validate(req, { sub: 'kc-sub-abc' });
      expect(result.token).toBeUndefined();
    });
  });
});
