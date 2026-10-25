import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  // Answers with the scope it was asked for, so the tests read the response.
  const authService = {
    getProfile: jest.fn(async (_userId: string, options: { organisationId?: string; organisationType?: string }) => ({
      organisationId: options.organisationId ?? null,
      organisationType: options.organisationType ?? null,
    })),
  };
  const controller = new AuthController(authService as unknown as AuthService);
  const req = { user: { sub: 'user-1', memberships: [] } } as unknown as Request;

  afterEach(() => jest.clearAllMocks());

  it('scopes the profile to a known organisationType', async () => {
    await expect(controller.me(req, undefined, 'PLATFORM')).resolves.toMatchObject({ organisationType: 'PLATFORM' });
  });

  it('refuses an unknown organisationType', async () => {
    await expect(controller.me(req, undefined, 'ADMIN')).rejects.toThrow(BadRequestException);
  });

  it('treats a blank organisationId and organisationType as not given', async () => {
    await expect(controller.me(req, '', '')).resolves.toEqual({ organisationId: null, organisationType: null });
  });
});
