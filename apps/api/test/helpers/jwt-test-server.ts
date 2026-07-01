import * as http from 'http';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';

/**
 * Stands up a throwaway HTTP server serving a JWKS document for a freshly
 * generated RSA keypair, and points KEYCLOAK_URL at it. This lets integration
 * tests sign real RS256 tokens that pass the same `passport-jwt` + `jwks-rsa`
 * validation path apps/api uses against the real Keycloak instance in
 * production — rather than the HS256/shared-secret pattern older fixtures
 * used, which the real JwtStrategy (algorithms: ['RS256']) always rejects.
 *
 * Must be started (and env vars set) BEFORE `Test.createTestingModule` /
 * `compile()` runs, since JwtStrategy reads KEYCLOAK_URL/KEYCLOAK_REALM at
 * construction time.
 */
export interface JwtTestServer {
  signToken(payload: Record<string, unknown>): string;
  close(): Promise<void>;
}

export async function startJwtTestServer(): Promise<JwtTestServer> {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'test-key-1';
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  const privatePem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;

  const jwks = { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] };

  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(jwks));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  process.env.KEYCLOAK_URL = `http://localhost:${port}`;
  process.env.KEYCLOAK_REALM = 'wholo';

  return {
    signToken(payload: Record<string, unknown>) {
      return jwt.sign(payload, privatePem, { algorithm: 'RS256', keyid: kid, expiresIn: '1h' });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
