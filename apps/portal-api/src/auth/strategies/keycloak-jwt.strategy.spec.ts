import { ConfigService } from '@nestjs/config';
import { KeycloakJwtStrategy } from './keycloak-jwt.strategy';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

describe('KeycloakJwtStrategy (portal-api)', () => {
  const strategy = new KeycloakJwtStrategy({
    get: (_key: string, fallback?: string) => fallback ?? '',
  } as unknown as ConfigService);

  it('accepts a verified Keycloak identity that has no Stocdup user yet, carrying its token through', () => {
    const principal = strategy.validate(
      { headers: { authorization: 'Bearer new-user-token' } } as never,
      { sub: 'kc-new-user', email: 'new@customer.test' },
    );

    expect(principal).toEqual({ sub: 'kc-new-user', email: 'new@customer.test', token: 'new-user-token' });
  });
});
