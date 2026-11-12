import { PrismaClient } from '@prisma/client';
import type { XeroApi } from './xero-data';

export interface ScenarioContext {
  prisma: PrismaClient;
  /** Values the run needs that only exist after seeding (a delivery link, an order number). */
  output: Record<string, string>;
}

/** Adds one scenario's starting data on top of the base. Never depends on another scenario. */
export type ScenarioSeed = (ctx: ScenarioContext) => Promise<void>;

/**
 * A scenario that starts before the base exists: everything is cleared and the base is not
 * created, so the docs owner signs in as a brand-new user with no business (onboarding).
 */
export interface FromNothing {
  startsFrom: 'nothing';
  seed: ScenarioSeed;
}

/** What a Xero scenario's `after` step gets: the seed context plus the Xero API itself. */
export interface XeroScenarioContext extends ScenarioContext {
  /** Calls Demo Company (UK) directly, for changes a scenario starts from (a renamed item). */
  xero: XeroApi;
}

/**
 * A scenario that needs Vine & Co connected to Xero (Demo Company (UK)). In order:
 *   1. the base, and Xero put back into the known state (lib/xero-data.ts);
 *   2. `before`: Stocdup data that must exist at the first sync, because the sync is what
 *      suggests matches (products and customers that match Xero records);
 *   3. the saved connection restored (lib/xero-connection.ts): `synced` false stops at
 *      "connected, never synced"; true waits for the real first sync;
 *   4. `after`: anything that needs the synced Xero records (links, changes made in Xero).
 * Needs the saved connection and Xero itself, so the integration spec doesn't run these.
 */
export interface WithXero {
  startsFrom: 'xero';
  synced: boolean;
  before: ScenarioSeed;
  after: (ctx: XeroScenarioContext) => Promise<void>;
}

export type ScenarioEntry = ScenarioSeed | FromNothing | WithXero;

export const fromNothing = (seed: ScenarioSeed = async () => {}): FromNothing => ({ startsFrom: 'nothing', seed });

export const withXero = ({
  synced,
  before = async () => {},
  after = async () => {},
}: {
  synced: boolean;
  before?: ScenarioSeed;
  after?: (ctx: XeroScenarioContext) => Promise<void>;
}): WithXero => ({ startsFrom: 'xero', synced, before, after });
