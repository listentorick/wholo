import { ConflictException, Injectable } from '@nestjs/common';
import { OrganisationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify, uniqueSlug } from '../common/slug';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';
import { CreateDistributorDto } from './dto/create-distributor.dto';

const organisationResponse = {
  id: true,
  name: true,
  slug: true,
  type: true,
  email: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  addressCity: true,
  addressState: true,
  addressPostcode: true,
  addressCountry: true,
  createdAt: true,
} satisfies Prisma.OrganisationSelect;

@Injectable()
export class DistributorsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Self-service onboarding: turn a verified Keycloak identity into a
   * distributor. Idempotent — a caller who already administers a distributor
   * gets that organisation back unchanged (wizard resume / double-submit).
   */
  async createForIdentity(identity: KeycloakIdentity, dto: CreateDistributorDto) {
    try {
      return await this.createInTransaction(identity, dto);
    } catch (e) {
      // Slug race between two identical business names: retry once, the
      // second pass sees the winner's slug and picks the next suffix.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && this.isSlugConflict(e)) {
        return await this.createInTransaction(identity, dto);
      }
      throw e;
    }
  }

  private async createInTransaction(identity: KeycloakIdentity, dto: CreateDistributorDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let user = await tx.user.findFirst({ where: { keycloakId: identity.sub, deletedAt: null } });

      if (!user) {
        // Never link by email — same account-takeover rationale as
        // UsersService.findOrCreateFromKeycloak for portal invitations.
        try {
          user = await tx.user.create({
            data: {
              keycloakId: identity.sub,
              email: identity.email,
              firstName: identity.given_name || 'Unknown',
              lastName: identity.family_name || '',
            },
          });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new ConflictException('An account with this email already exists. Please sign in with it instead.');
          }
          throw e;
        }
      } else {
        // Serialise concurrent submits for the same person.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      }

      const existing = await tx.membership.findFirst({
        where: {
          userId: user.id,
          role: Role.DISTRIBUTOR_ADMIN,
          organisation: { type: OrganisationType.DISTRIBUTOR, deletedAt: null },
        },
        include: { organisation: { select: organisationResponse } },
      });
      if (existing) return existing.organisation;

      const slug = await this.resolveSlug(tx, dto);

      const organisation = await tx.organisation.create({
        data: {
          name: dto.name,
          slug,
          type: OrganisationType.DISTRIBUTOR,
          email: dto.email,
          phone: dto.phone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          addressCity: dto.addressCity,
          addressState: dto.addressState,
          addressPostcode: dto.addressPostcode,
          addressCountry: dto.addressCountry,
        },
        select: organisationResponse,
      });

      await tx.membership.create({
        data: { userId: user.id, organisationId: organisation.id, role: Role.DISTRIBUTOR_ADMIN },
      });

      return organisation;
    });
  }

  /**
   * A slug the registrant typed must be honoured or rejected — never silently
   * suffixed. An omitted slug is derived from the name with `-2`, `-3`…
   * suffixing on collision, as before.
   */
  private async resolveSlug(tx: Prisma.TransactionClient, dto: CreateDistributorDto): Promise<string> {
    if (dto.slug) {
      const existing = await tx.organisation.findUnique({ where: { slug: dto.slug }, select: { id: true } });
      if (existing) {
        throw new ConflictException('That portal address is already taken — choose another.');
      }
      return dto.slug;
    }

    const base = slugify(dto.name);
    const taken = await tx.organisation.findMany({
      where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
      select: { slug: true },
    });
    return uniqueSlug(base, new Set(taken.map((o) => o.slug).filter((s): s is string => s !== null)));
  }

  private isSlugConflict(e: Prisma.PrismaClientKnownRequestError): boolean {
    const target = (e.meta as { target?: string[] } | undefined)?.target;
    return Array.isArray(target) ? target.includes('slug') : true;
  }
}
