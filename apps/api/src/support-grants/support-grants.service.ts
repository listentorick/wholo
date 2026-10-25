import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, OrganisationType, Prisma, Role, SupportAccessEndedBy } from '@prisma/client';
import {
  Permission,
  SUPPORT_GRANT_DEFAULT_MINUTES,
  SUPPORT_GRANT_MAX_MINUTES,
  SUPPORT_GRANT_MIN_MINUTES,
  SupportGrant,
} from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestUser, hasPlatformPermissions, ownMembership, permissionsOf } from '../auth/ops-session';
import { CreateSupportGrantDto } from './dto/create-support-grant.dto';

const ENTITY_TYPE = 'SupportAccessGrant';
const RECENT_LIMIT = 50;
/** Postgres may abort one of two serializable transactions that overlap (Prisma P2034); try that many times. */
const SERIALIZABLE_ATTEMPTS = 3;

function isSerializationFailure(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034';
}

const grantInclude = {
  distributor: { select: { name: true, slug: true } },
  user: { select: { firstName: true, lastName: true } },
} satisfies Prisma.SupportAccessGrantInclude;

type GrantRow = Prisma.SupportAccessGrantGetPayload<{ include: typeof grantInclude }>;

/** Clamp a requested visit length to the allowed range (ADR-078). */
export function clampDurationMinutes(requested: number | undefined): number {
  const minutes = requested ?? SUPPORT_GRANT_DEFAULT_MINUTES;
  return Math.min(SUPPORT_GRANT_MAX_MINUTES, Math.max(SUPPORT_GRANT_MIN_MINUTES, Math.floor(minutes)));
}

function fullName(u: { firstName: string; lastName: string }): string {
  return `${u.firstName} ${u.lastName}`.trim();
}

/**
 * Support grants (ADR-078): a platform operator's self-issued, time-limited
 * pass into one distributor. Every rule lives here and in the guards in front
 * of it — the BFFs only forward. Grants are never deleted.
 */
@Injectable()
export class SupportGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(caller: RequestUser, distributorId: string, dto: CreateSupportGrantDto, now: Date = new Date()): Promise<SupportGrant> {
    if (dto.userId !== caller.sub) throw new ForbiddenException('Support access can only be opened for yourself');
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('Say why you are opening this account');

    const distributor = await this.prisma.organisation.findFirst({
      where: { id: distributorId, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organisationId: { userId: caller.sub, organisationId: distributorId } },
      select: { id: true },
    });
    if (membership) throw new ConflictException('You are already a member of this distributor');

    const holder = await this.prisma.user.findUniqueOrThrow({ where: { id: caller.sub }, select: { firstName: true, lastName: true } });
    const expiresAt = new Date(now.getTime() + clampDurationMinutes(dto.durationMinutes) * 60_000);

    const row = await this.retryingSerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          // One active grant per person per distributor: opening again extends
          // the current one (never past the cap from now) instead of adding a row.
          // The grant keeps the reason it was opened with; a new reason is in
          // the extension's audit row.
          const active = await tx.supportAccessGrant.findFirst({
            where: { userId: caller.sub, distributorId, revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } },
          });
          const grant = active
            ? await tx.supportAccessGrant.update({
                where: { id: active.id },
                data: { expiresAt: active.expiresAt > expiresAt ? active.expiresAt : expiresAt },
                include: grantInclude,
              })
            : await tx.supportAccessGrant.create({
                data: { userId: caller.sub, distributorId, role: Role.SUPPORT, reason, startsAt: now, expiresAt },
                include: grantInclude,
              });
          await this.audit.record(tx, {
            distributorId,
            entityType: ENTITY_TYPE,
            entityId: grant.id,
            action: active ? 'SUPPORT_ACCESS_EXTENDED' : 'SUPPORT_ACCESS_STARTED',
            actorType: ActorType.USER,
            actorUserId: caller.sub,
            actorName: `${fullName(holder)} (Stocdup support)`,
            summary: `Stocdup support ${active ? 'extended access' : 'opened the account'} until ${grant.expiresAt.toISOString()}: ${reason}`,
          });
          return grant;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    return this.toView(row, now);
  }

  /**
   * Two opens of the same account at once (a double click, two tabs) can
   * make Postgres abort one serializable transaction. Run it again: the retry
   * sees the other's grant and extends it. Give up with a 409, not a 500.
   */
  private async retryingSerializable<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await run();
      } catch (e) {
        if (!isSerializationFailure(e)) throw e;
        if (attempt >= SERIALIZABLE_ATTEMPTS) {
          throw new ConflictException('This account is being opened somewhere else at the same moment. Please try again.');
        }
      }
    }
  }

  /** The caller's own grants: active ones first, then recent. */
  async listForUser(caller: RequestUser, userId: string, now: Date = new Date()): Promise<SupportGrant[]> {
    if (userId !== caller.sub) throw new ForbiddenException('You can only list your own support access');
    const rows = await this.prisma.supportAccessGrant.findMany({
      where: { userId },
      include: grantInclude,
      orderBy: { startsAt: 'desc' },
      take: RECENT_LIMIT,
    });
    return this.activeFirst(rows.map((r) => this.toView(r, now)));
  }

  /**
   * Grants on a distributor, for its own staff. `activeOnly` feeds the
   * "Stocdup support is in your account" strip and is open to any member;
   * the full history (with change counts) needs team management.
   */
  async listForDistributor(caller: RequestUser, distributorId: string, activeOnly: boolean, now: Date = new Date()): Promise<SupportGrant[]> {
    const membership = ownMembership(caller, distributorId);
    if (!membership) throw new ForbiddenException('Not authorized for this distributor');
    if (!activeOnly && !permissionsOf(membership).has(Permission.TEAM_MANAGE)) {
      throw new ForbiddenException('Missing required permission');
    }

    const rows = await this.prisma.supportAccessGrant.findMany({
      where: activeOnly
        ? { distributorId, revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } }
        : { distributorId },
      include: grantInclude,
      orderBy: { startsAt: 'desc' },
      take: RECENT_LIMIT,
    });
    const views = rows.map((r) => this.toView(r, now));
    if (activeOnly) return views;

    const counts = await Promise.all(rows.map((r) => this.changeCount(r, now)));
    return this.activeFirst(views.map((v, i) => ({ ...v, changeCount: counts[i] })));
  }

  /**
   * End a grant. Allowed for its holder (in an ops session), the
   * distributor's own team managers, and any platform admin (ops session).
   * Ending an already-ended grant is a no-op.
   */
  async revoke(caller: RequestUser, distributorId: string, grantId: string, now: Date = new Date()): Promise<SupportGrant> {
    const grant = await this.prisma.supportAccessGrant.findFirst({ where: { id: grantId, distributorId }, include: grantInclude });
    if (!grant) throw new NotFoundException('Support access not found');

    const isHolder = caller.opsSession === true && grant.userId === caller.sub;
    const isDistributorManager = permissionsOf(ownMembership(caller, distributorId)).has(Permission.TEAM_MANAGE);
    const isPlatformAdmin = hasPlatformPermissions(caller, [Permission.SUPPORT_GRANTS_SELF_CREATE]);
    if (!isHolder && !isDistributorManager && !isPlatformAdmin) throw new ForbiddenException('You cannot end this support access');

    if (grant.revokedAt || grant.expiresAt <= now) {
      return this.toView(grant, now);
    }

    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: caller.sub }, select: { firstName: true, lastName: true } });
    const row = await this.prisma.$transaction(async (tx) => {
      // Only an open grant is ended, checked in the update itself: when two
      // people end it at once, the second finds nothing to end and neither
      // overwrites who ended it nor adds a second audit row.
      const { count } = await tx.supportAccessGrant.updateMany({
        where: { id: grant.id, revokedAt: null, expiresAt: { gt: now } },
        // Which side ended it is fixed now, not worked out later from who is
        // a member then (a removed Owner must not turn into "Stocdup").
        data: {
          revokedAt: now,
          revokedByUserId: caller.sub,
          endedBy: isHolder ? SupportAccessEndedBy.HOLDER : isDistributorManager ? SupportAccessEndedBy.DISTRIBUTOR : SupportAccessEndedBy.STOCDUP,
        },
      });
      const updated = await tx.supportAccessGrant.findUniqueOrThrow({ where: { id: grant.id }, include: grantInclude });
      if (count === 0) return updated;
      await this.audit.record(tx, {
        distributorId,
        entityType: ENTITY_TYPE,
        entityId: grant.id,
        action: 'SUPPORT_ACCESS_ENDED',
        actorType: ActorType.USER,
        actorUserId: caller.sub,
        actorName: isDistributorManager ? fullName(actor) : `${fullName(actor)} (Stocdup support)`,
        summary: `${isHolder ? 'Stocdup support left' : `${fullName(actor)} ended Stocdup support access for ${fullName(grant.user)}`}`,
      });
      return updated;
    });
    return this.toView(row, now);
  }

  private toView(row: GrantRow, now: Date): SupportGrant {
    const status = row.revokedAt ? 'ENDED' : row.expiresAt <= now ? 'EXPIRED' : 'ACTIVE';
    // Grants ended before endedBy was recorded (local test data only) fall back
    // to what the row itself says.
    const endedBy = row.revokedAt
      ? (row.endedBy ?? (row.revokedByUserId === row.userId ? SupportAccessEndedBy.HOLDER : SupportAccessEndedBy.STOCDUP))
      : null;
    return {
      id: row.id,
      distributorId: row.distributorId,
      distributorName: row.distributor.name,
      distributorSlug: row.distributor.slug,
      holder: { id: row.userId, name: fullName(row.user) },
      reason: row.reason,
      startsAt: row.startsAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      status,
      endedBy,
    };
  }

  private activeFirst(views: SupportGrant[]): SupportGrant[] {
    return [...views.filter((v) => v.status === 'ACTIVE'), ...views.filter((v) => v.status !== 'ACTIVE')];
  }

  /** Audit-logged actions the holder took at the distributor during the visit. */
  private changeCount(row: GrantRow, now: Date): Promise<number> {
    const end = row.revokedAt ?? (row.expiresAt < now ? row.expiresAt : now);
    return this.prisma.auditLog.count({
      where: {
        distributorId: row.distributorId,
        actorUserId: row.userId,
        entityType: { not: ENTITY_TYPE },
        createdAt: { gte: row.startsAt, lte: end },
      },
    });
  }
}
