import { PrismaClient } from '@prisma/client';
import { SCENARIOS } from '../scenarios';
import { createBase } from './base';
import { clearDocsWorld } from './clear';
import { assertLocalDatabase, assertNoDemoCollision } from './guard';
import { removeSignUps } from './sign-ups';
import { connectXero, saveXeroConnection } from './xero-connection';
import { resetXeroData, xeroApi } from './xero-data';

type Log = (line: string) => void;

/**
 * Everything gone, then the base: the state every scenario starts from and returns to. A live
 * Xero connection is saved first (lib/xero-connection.ts), so the clear-down never loses it.
 */
export async function resetToBase(prisma: PrismaClient, log: Log = () => {}): Promise<void> {
  assertLocalDatabase();
  await assertNoDemoCollision(prisma);
  await saveXeroConnection(prisma, log);
  await clearDocsWorld(prisma, log);
  await removeSignUps(log);
  await createBase(prisma);
  log('Base created: Vine & Co, ready.');
}

/** The base plus one scenario's starting data. Returns the values the run needs. */
export async function seedScenario(prisma: PrismaClient, scenario: string, log: Log = () => {}): Promise<Record<string, string>> {
  const seed = SCENARIOS[scenario];
  if (!seed) throw new Error(`No seed for scenario "${scenario}". Known: ${Object.keys(SCENARIOS).sort().join(', ')}`);
  const output: Record<string, string> = {};
  if (typeof seed === 'function') {
    await resetToBase(prisma, log);
    await seed({ prisma, output });
  } else if (seed.startsFrom === 'xero') {
    await resetToBase(prisma, log);
    await resetXeroData(prisma, undefined, log);
    await seed.before({ prisma, output });
    await connectXero(prisma, { synced: seed.synced, log });
    await seed.after({ prisma, output, xero: await xeroApi(prisma) });
  } else {
    await clearAll(prisma, log);
    log('No base: starts from a brand-new sign-up.');
    await seed.seed({ prisma, output });
  }
  log(`Seeded ${scenario}.`);
  return output;
}

/** Removes the docs world entirely, base included. */
export async function clearAll(prisma: PrismaClient, log: Log = () => {}): Promise<void> {
  assertLocalDatabase();
  await assertNoDemoCollision(prisma);
  await saveXeroConnection(prisma, log);
  await clearDocsWorld(prisma, log);
  await removeSignUps(log);
  log('Docs data cleared.');
}
