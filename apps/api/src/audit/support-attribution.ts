import { PrismaService } from '../prisma/prisma.service';

export const SUPPORT_ACTOR_SUFFIX = ' (Stocdup support)';

interface GrantWindow {
  userId: string;
  startsAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * True when `actorUserId` held a support grant on this distributor covering
 * `at` (ADR-078). Grant holders are never members of the distributor, so an
 * actor matching a grant window acted as Stocdup support.
 */
export function actedAsSupport(windows: GrantWindow[], actorUserId: string | null, at: Date): boolean {
  if (!actorUserId) return false;
  return windows.some((w) => w.userId === actorUserId && w.startsAt <= at && at <= (w.revokedAt ?? w.expiresAt));
}

/**
 * Label audit entries written by a support visitor: the stored row is left as
 * written; the read adds `viaSupport` and the "(Stocdup support)" suffix, so
 * existing audit writers need no change.
 */
export async function labelSupportActors<T extends { actorUserId: string | null; actorName: string | null; createdAt: Date }>(
  prisma: PrismaService,
  distributorId: string,
  entries: T[],
): Promise<(T & { viaSupport: boolean })[]> {
  const actors = [...new Set(entries.map((e) => e.actorUserId).filter((id): id is string => !!id))];
  const windows = actors.length
    ? await prisma.supportAccessGrant.findMany({
        where: { distributorId, userId: { in: actors } },
        select: { userId: true, startsAt: true, expiresAt: true, revokedAt: true },
      })
    : [];
  return entries.map((e) => {
    const viaSupport = actedAsSupport(windows, e.actorUserId, e.createdAt);
    const actorName = viaSupport && e.actorName && !e.actorName.endsWith(SUPPORT_ACTOR_SUFFIX) ? `${e.actorName}${SUPPORT_ACTOR_SUFFIX}` : e.actorName;
    return { ...e, actorName, viaSupport };
  });
}
