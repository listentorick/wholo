import { PrismaClient } from '@prisma/client';
import { DOCS_DISTRIBUTOR_ID, DOCS_DISTRIBUTOR_SLUG, DOCS_ONBOARDING_SLUGS, DOCS_USERS } from './ids';

/**
 * The docs scripts delete data, so they only ever run against a database on this machine
 * (same rule as scripts/seed-demo-dashboards.ts).
 */
export function assertLocalDatabase(url = process.env.DATABASE_URL): void {
  if (!url) throw new Error('DATABASE_URL is not set');
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to run against "${host}": the docs scenario scripts are for a local database only`);
  }
}

/**
 * The docs distributor borrows the demo seed's slug and sign-in users. Both worlds can't
 * exist at once: a second distributor membership would make the signed-in owner's
 * organisation ambiguous. Refuse rather than guess.
 */
export async function assertNoDemoCollision(prisma: PrismaClient): Promise<void> {
  const slugOwner = await prisma.organisation.findUnique({ where: { slug: DOCS_DISTRIBUTOR_SLUG }, select: { id: true } });
  if (slugOwner && slugOwner.id !== DOCS_DISTRIBUTOR_ID) {
    throw new Error(
      `Another organisation (${slugOwner.id}) already uses the slug "${DOCS_DISTRIBUTOR_SLUG}". ` +
        'The demo seed is loaded; clear it before running the docs scenarios.',
    );
  }
  const keycloakIds = Object.values(DOCS_USERS).map((u) => u.keycloakId);
  const foreign = await prisma.membership.findFirst({
    where: {
      user: { keycloakId: { in: keycloakIds } },
      organisationId: { not: DOCS_DISTRIBUTOR_ID },
      // A business a docs run made through onboarding is docs data, not the demo seed.
      organisation: { type: 'DISTRIBUTOR', OR: [{ slug: null }, { slug: { notIn: [...DOCS_ONBOARDING_SLUGS] } }] },
    },
    select: { organisationId: true },
  });
  if (foreign) {
    throw new Error(
      `A docs sign-in user is also a member of distributor ${foreign.organisationId}. ` +
        'The demo seed is loaded; clear it before running the docs scenarios.',
    );
  }
}
