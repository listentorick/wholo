import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { memberships: { include: { organisation: true } } },
    });
  }

  async findByKeycloakId(keycloakId: string) {
    const user = await this.prisma.user.findFirst({
      where: { keycloakId, deletedAt: null },
      include: { memberships: { include: { organisation: true } } },
    });
    if (user) return user;

    // JIT link: first Keycloak login for a user created before Keycloak migration
    // Match by email is handled in the strategy via a separate email claim lookup.
    // This method only handles the keycloakId lookup path.
    return null;
  }

  async linkKeycloakId(email: string, keycloakId: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, keycloakId: null, deletedAt: null },
      include: { memberships: { include: { organisation: true } } },
    });
    if (!user) return null;
    return this.prisma.user.update({
      where: { id: user.id },
      data: { keycloakId },
      include: { memberships: { include: { organisation: true } } },
    });
  }

  async findOrCreateFromKeycloak(keycloakId: string, email: string, firstName: string, lastName: string) {
    const byId = await this.prisma.user.findFirst({ where: { keycloakId, deletedAt: null } });
    if (byId) return byId;

    // Never auto-link by email here — that path is reserved for admin JIT migration
    // (linkKeycloakId, called from JwtStrategy). Auto-linking a verified email from a
    // portal flow would allow account takeover if a different person registered the same
    // address in Keycloak before the original user did.
    return this.prisma.user.create({
      data: { keycloakId, email, firstName: firstName || 'Unknown', lastName: lastName || '' },
    });
  }
}
