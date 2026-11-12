import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One-time codes that let a signed-in person accept an invitation sent to a
 * DIFFERENT address than their login (ADR-081). The code is emailed to the
 * invited address, so whoever reads that mailbox approves this account.
 *
 * A code belongs to one invitation and one Keycloak identity (`sub`): a code
 * requested in one session is useless in another, and on another invitation.
 * Only its hash is stored; the plaintext exists only in the email, which is why
 * it is sent here, in the request, rather than through the outbox (whose
 * payloads are stored).
 *
 * Checking and consuming are separate on purpose: a wrong guess must be
 * counted even though the acceptance is then refused, so `check` writes the
 * attempt outside the caller's transaction, and `consume` marks the code used
 * inside it.
 */

export type InvitationKind = 'CUSTOMER' | 'STAFF';

export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_CODES_PER_INVITATION = 10;

export interface InvitationClaimant {
  sub: string;
  email: string;
}

export interface SendCodeInput {
  kind: InvitationKind;
  invitationId: string;
  invitedEmail: string;
  claimant: InvitationClaimant;
  businessName: string;
  inviterName: string | null;
}

export interface CheckCodeInput {
  kind: InvitationKind;
  invitationId: string;
  sub: string;
  code: string;
}

export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function hashCode(invitationId: string, sub: string, code: string): string {
  return createHash('sha256').update(`${invitationId}:${sub}:${code}`).digest('hex');
}

function invitationWhere(kind: InvitationKind, invitationId: string) {
  return kind === 'CUSTOMER' ? { customerInvitationId: invitationId } : { staffInvitationId: invitationId };
}

function claimKey(kind: InvitationKind, invitationId: string, sub: string): Prisma.InvitationEmailCodeWhereUniqueInput {
  return kind === 'CUSTOMER'
    ? { customerInvitationId_keycloakSub: { customerInvitationId: invitationId, keycloakSub: sub } }
    : { staffInvitationId_keycloakSub: { staffInvitationId: invitationId, keycloakSub: sub } };
}

@Injectable()
export class InvitationCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async send(input: SendCodeInput): Promise<{ sentTo: string; expiresInMinutes: number }> {
    const { kind, invitationId, invitedEmail, claimant } = input;
    if (sameEmail(claimant.email, invitedEmail)) {
      throw new BadRequestException('You are signed in with the invited address, so no code is needed.');
    }

    const key = claimKey(kind, invitationId, claimant.sub);
    const existing = await this.prisma.invitationEmailCode.findUnique({ where: key });
    if (existing?.lastSentAt && Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new HttpException('We sent a code less than a minute ago. Wait a moment, then send a new one.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const sent = await this.prisma.invitationEmailCode.aggregate({
      where: invitationWhere(kind, invitationId),
      _sum: { sendCount: true },
    });
    if ((sent._sum.sendCount ?? 0) >= MAX_CODES_PER_INVITATION) {
      throw new HttpException(
        'Too many codes have been sent for this invitation. Ask for a new invitation.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const fresh = {
      claimantEmail: claimant.email,
      codeHash: hashCode(invitationId, claimant.sub, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      attempts: 0,
      consumedAt: null,
    };
    const claim = await this.prisma.invitationEmailCode.upsert({
      where: key,
      create: { ...invitationWhere(kind, invitationId), keycloakSub: claimant.sub, ...fresh },
      update: fresh,
    });

    try {
      await this.mail.sendInvitationCode(invitedEmail, {
        businessName: input.businessName,
        inviterName: input.inviterName,
        invitedEmail,
        claimantEmail: claimant.email,
        code,
        expiresInMinutes: CODE_TTL_MINUTES,
      });
    } catch {
      throw new ServiceUnavailableException("We couldn't send the code just now. Try again in a moment.");
    }

    // Counted only once the email has gone, so a failed send never blocks a retry.
    await this.prisma.invitationEmailCode.update({
      where: { id: claim.id },
      data: { lastSentAt: new Date(), sendCount: { increment: 1 } },
    });
    return { sentTo: invitedEmail, expiresInMinutes: CODE_TTL_MINUTES };
  }

  /**
   * Checks a code for this invitation and identity. Returns the claim id to
   * `consume` in the acceptance transaction.
   *
   * Every check uses up one of the code's tries BEFORE the code is compared,
   * in a single conditional update (attempts below the limit, not expired, not
   * used). So the limit holds however many guesses arrive at once: if it were
   * counted after a wrong guess instead, parallel requests would all read
   * "tries left" before any of them counted, and each would get compared.
   * A right code keeps the try it used.
   */
  async check(input: CheckCodeInput): Promise<string> {
    const { kind, invitationId, sub } = input;
    const claim = await this.prisma.invitationEmailCode.findUnique({ where: claimKey(kind, invitationId, sub) });
    if (!claim || !claim.lastSentAt || claim.consumedAt) {
      throw new UnprocessableEntityException('No code has been sent to you for this invitation. Send a code first.');
    }

    const reserved = await this.prisma.invitationEmailCode.updateMany({
      where: { id: claim.id, codeHash: claim.codeHash, consumedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS }, expiresAt: { gt: new Date() } },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count === 0) {
      throw new UnprocessableEntityException(await this.whyRefused(claim.id));
    }

    const code = input.code.replace(/\s+/g, '');
    const given = Buffer.from(hashCode(invitationId, sub, code), 'hex');
    const stored = Buffer.from(claim.codeHash, 'hex');
    const matches = /^\d{6}$/.test(code) && given.length === stored.length && timingSafeEqual(given, stored);
    if (!matches) {
      const updated = await this.prisma.invitationEmailCode.findUniqueOrThrow({ where: { id: claim.id } });
      const left = Math.max(0, MAX_CODE_ATTEMPTS - updated.attempts);
      throw new UnprocessableEntityException(
        left > 0 ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : "That code isn't right. Send a new code.",
      );
    }
    return claim.id;
  }

  /** Why a try couldn't be used up: re-read, since another request may have changed the claim. */
  private async whyRefused(claimId: string): Promise<string> {
    const now = await this.prisma.invitationEmailCode.findUnique({ where: { id: claimId } });
    if (!now || now.consumedAt) return 'That code has already been used. Send a new code.';
    if (now.attempts >= MAX_CODE_ATTEMPTS) return 'Too many wrong codes. Send a new code.';
    if (now.expiresAt.getTime() <= Date.now()) return 'That code has expired. Send a new code.';
    // A new code was sent while this one was being checked.
    return 'A new code was sent. Use the newest one.';
  }

  /** Marks a checked code used, inside the acceptance transaction. A code can only be used once. */
  async consume(tx: Prisma.TransactionClient, claimId: string): Promise<void> {
    const used = await tx.invitationEmailCode.updateMany({
      where: { id: claimId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (used.count === 0) {
      throw new UnprocessableEntityException('That code has already been used. Send a new code.');
    }
  }
}
