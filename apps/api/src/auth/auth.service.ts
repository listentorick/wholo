import { Injectable } from '@nestjs/common';
import { OrganisationType } from '@prisma/client';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    // Prefer a DISTRIBUTOR-side membership when the user holds one — admin-api's
    // JwtStrategy asserts organisationType to keep trade customers off the admin
    // surface (ADR-053), so this can't be an arbitrary "first membership" pick.
    const membership =
      user.memberships.find((m) => m.organisation.type === OrganisationType.DISTRIBUTOR) ??
      user.memberships[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: membership?.role,
      organisationId: membership?.organisationId,
      organisationName: membership?.organisation?.name,
      organisationType: membership?.organisation?.type,
      organisationCurrencyCode: membership?.organisation?.distributorSettings?.currencyCode,
    };
  }
}
