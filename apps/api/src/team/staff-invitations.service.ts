import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType, InvitationStatus, OrganisationType, Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffInvitationDto, UpdateStaffRolesDto } from './dto/staff-roles.dto';
import { assertAssignableRoles } from './staff-roles';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StaffInvitationView {
  id: string;
  email: string;
  roles: Role[];
  /** PENDING until `expiresAt`, then EXPIRED (nothing sweeps the column). */
  status: 'PENDING' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string };
}

interface InvitationRow {
  id: string;
  email: string;
  roles: Role[];
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { id: string; firstName: string; lastName: string };
}

const invitedBySelect = { select: { id: true, firstName: true, lastName: true } } as const;

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function fullName(u: { firstName: string; lastName: string }): string {
  return `${u.firstName} ${u.lastName}`.trim();
}

@Injectable()
export class StaffInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {}

  async list(distributorId: string): Promise<StaffInvitationView[]> {
    const rows = await this.prisma.staffInvitation.findMany({
      where: { distributorId, status: InvitationStatus.PENDING },
      include: { invitedBy: invitedBySelect },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toView(r));
  }

  async create(distributorId: string, actorUserId: string, dto: CreateStaffInvitationDto): Promise<StaffInvitationView> {
    const email = normaliseEmail(dto.email);
    const roles = assertAssignableRoles(dto.roles);
    return this.issue(distributorId, actorUserId, email, roles, 'INVITED');
  }

  async resend(distributorId: string, invitationId: string, actorUserId: string): Promise<StaffInvitationView> {
    const existing = await this.findPending(distributorId, invitationId);
    return this.issue(distributorId, actorUserId, existing.email, existing.roles, 'RESENT');
  }

  async updateRoles(
    distributorId: string,
    invitationId: string,
    actorUserId: string,
    dto: UpdateStaffRolesDto,
  ): Promise<StaffInvitationView> {
    const roles = assertAssignableRoles(dto.roles);
    const existing = await this.findPending(distributorId, invitationId);
    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('This invitation has expired. Resend it to change its roles.');
    }
    const actor = await this.loadActor(actorUserId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.staffInvitation.update({
        where: { id: existing.id },
        data: { roles },
        include: { invitedBy: invitedBySelect },
      });
      await this.audit.record(tx, {
        distributorId,
        entityType: 'STAFF_INVITATION',
        entityId: existing.id,
        action: 'ROLES_UPDATED',
        actorType: ActorType.USER,
        actorUserId,
        actorName: fullName(actor),
        summary: `Changed the roles on the invitation for ${existing.email}`,
        changes: { email: existing.email, from: existing.roles, to: roles },
      });
      return row;
    });
    return this.toView(updated);
  }

  async revoke(distributorId: string, invitationId: string, actorUserId: string): Promise<void> {
    const existing = await this.findPending(distributorId, invitationId);
    const actor = await this.loadActor(actorUserId);

    await this.prisma.$transaction(async (tx) => {
      await tx.staffInvitation.update({
        where: { id: existing.id },
        data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
      });
      await this.audit.record(tx, {
        distributorId,
        entityType: 'STAFF_INVITATION',
        entityId: existing.id,
        action: 'REVOKED',
        actorType: ActorType.USER,
        actorUserId,
        actorName: fullName(actor),
        summary: `Revoked the invitation for ${existing.email}`,
        changes: { email: existing.email, roles: existing.roles },
      });
    });
  }

  /**
   * Creates (or re-creates, for resend) the invitation: revokes any earlier
   * PENDING invitation for the same address, writes the new row and the
   * outbox event that drives the email, all in one transaction. A resend is a
   * revoke + create, exactly like customer invitations (ADR-027) — the link in
   * the earlier email stops working.
   */
  private async issue(
    distributorId: string,
    actorUserId: string,
    email: string,
    roles: Role[],
    action: 'INVITED' | 'RESENT',
  ): Promise<StaffInvitationView> {
    const [distributor, actor, existingUser] = await Promise.all([
      this.prisma.organisation.findFirst({
        where: { id: distributorId, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
        select: { id: true, name: true, email: true, phone: true },
      }),
      this.loadActor(actorUserId),
      // Includes soft-deleted users: a removed person's address stays taken.
      this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }),
    ]);
    if (!distributor) throw new NotFoundException('Distributor not found');
    if (existingUser) {
      throw new ConflictException('This email already has a Stocdup account, so it can’t be invited. Use a different address.');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const inviteUrl = `${this.config.getOrThrow<string>('ADMIN_URL')}/accept-invite?token=${token}`;

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.staffInvitation.updateMany({
        where: { distributorId, email, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
      });
      const created = await tx.staffInvitation.create({
        data: { distributorId, email, roles, tokenHash: hashInvitationToken(token), expiresAt, invitedByUserId: actorUserId },
        include: { invitedBy: invitedBySelect },
      });
      await this.audit.record(tx, {
        distributorId,
        entityType: 'STAFF_INVITATION',
        entityId: created.id,
        action,
        actorType: ActorType.USER,
        actorUserId,
        actorName: fullName(actor),
        summary: `${action === 'INVITED' ? 'Invited' : 'Resent the invitation to'} ${email}`,
        changes: { email, roles },
      });
      // Sending is async from here (NOTIFICATIONS_QUEUE, routed via EVENT_ROUTES).
      await this.outbox.writeEvent(tx, 'StaffInvitation', created.id, 'StaffInviteSent', {
        invitationId: created.id,
        distributorId,
        email,
        roles,
        distributorName: distributor.name,
        distributorEmail: distributor.email,
        distributorPhone: distributor.phone,
        inviterName: fullName(actor),
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
      });
      return created;
    });
    return this.toView(row);
  }

  /** PENDING, in this distributor — an expired one still counts (it can be resent or revoked). */
  private async findPending(distributorId: string, invitationId: string) {
    const invitation = await this.prisma.staffInvitation.findFirst({
      where: { id: invitationId, distributorId, status: InvitationStatus.PENDING },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }

  private async loadActor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private toView(row: InvitationRow): StaffInvitationView {
    return {
      id: row.id,
      email: row.email,
      roles: row.roles,
      status: row.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'PENDING',
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      invitedBy: { id: row.invitedBy.id, name: fullName(row.invitedBy) },
    };
  }
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
