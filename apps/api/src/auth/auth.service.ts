import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    const membership = user.memberships[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: membership?.role,
      organisationId: membership?.organisationId,
      organisationName: membership?.organisation?.name,
    };
  }
}
