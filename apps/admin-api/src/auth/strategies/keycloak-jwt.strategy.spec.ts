import { ConfigService } from '@nestjs/config';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

// eslint-disable-next-line import/first
import { KeycloakJwtStrategy } from './keycloak-jwt.strategy';

describe('KeycloakJwtStrategy', () => {
  const strategy = new KeycloakJwtStrategy(new ConfigService());

  it('returns the raw claims plus the bearer token without any user lookup', () => {
    const req = { headers: { authorization: 'Bearer tok-123' } } as never;
    const result = strategy.validate(req, {
      sub: 'kc-1',
      email: 'ada@acme.com',
      given_name: 'Ada',
      family_name: 'Acme',
    });

    expect(result).toEqual({
      sub: 'kc-1',
      email: 'ada@acme.com',
      given_name: 'Ada',
      family_name: 'Acme',
      token: 'tok-123',
    });
  });

  it('tolerates missing optional claims', () => {
    const req = { headers: { authorization: 'Bearer tok-123' } } as never;
    const result = strategy.validate(req, { sub: 'kc-2' });

    expect(result.sub).toBe('kc-2');
    expect(result.email).toBeUndefined();
  });
});
