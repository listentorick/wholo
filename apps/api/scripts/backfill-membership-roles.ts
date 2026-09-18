/**
 * Multi-role RBAC PBI: populate MembershipRole for every existing
 * Membership from its legacy single `role` column.
 *
 * Not a rollout prerequisite — AuthService/JwtStrategy already fall back to
 * the legacy `role` column until this has run, so no live user is blocked
 * on this. This is cleanup needed before the later migration that drops the
 * `role` column. Idempotent: safe to re-run.
 *
 * Usage: pnpm --filter @wholo/api db:membership-roles:backfill
 * Requires DATABASE_URL (port-forward Postgres first: pnpm k8s:pf:postgres).
 */
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const memberships = await prisma.membership.findMany({ select: { id: true, role: true } });

    let backfilled = 0;
    for (const membership of memberships) {
      await prisma.membershipRole.upsert({
        where: { membershipId_role: { membershipId: membership.id, role: membership.role } },
        create: { membershipId: membership.id, role: membership.role },
        update: {},
      });
      backfilled++;
    }

    console.log(`Done. Backfilled MembershipRole for ${backfilled} of ${memberships.length} membership(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
