import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import {
  AccountingConnectionStatus,
  AccountingInvoiceTargetStatus,
  AccountingProvider,
  IngestionRunStatus,
  IngestionRunTrigger,
  PrismaClient,
} from '@prisma/client';
import { TokenEncryptionService } from '../../../src/accounting/token-encryption.service';
import type { AccountingTokenSet } from '../../../src/accounting/adapters/accounting-connection-adapter.interface';
import { ACCOUNTING_SOURCE_TYPE, ACCOUNTING_SYNC_RESOURCE_TYPES } from '../../../src/accounting/sync/accounting-sync.constants';
import { DOCS_DISTRIBUTOR_ID, DOCS_USERS } from './ids';

/**
 * Vine & Co's Xero connection (Demo Company (UK)), kept between docs runs.
 *
 * A seed can't create a Xero connection: it holds OAuth tokens, and Xero hands out a new
 * refresh token every time one is used. So the owner connects once in the app, and this file
 * keeps the connection's details: every reset saves the live connection before the clear-down
 * removes it, and the Xero scenarios' seeds put it back (connectXero). The last save of a
 * batch (docs:clear) leaves the newest token in the file for the next run.
 *
 * The credentials stay encrypted with the cluster's ACCOUNTING_TOKEN_ENCRYPTION_KEY (set in the
 * git-ignored helm/wholo/values.local.yaml), so the file is useless without that key.
 */

export const DOCS_XERO_CONNECTION_ID = 'docs-xero-connection';
export const DOCS_XERO_ORGANISATION_ID = 'docs-xero-organisation';

export interface SavedXeroConnection {
  provider: AccountingProvider;
  externalOrganisationId: string;
  organisationName: string;
  invoiceExportTargetStatus: AccountingInvoiceTargetStatus;
  scopes: string;
  encryptedCredentialData: string;
  savedAt: string;
}

const RECONNECT_HELP =
  'Connect Xero once as James at https://admin.localhost:8443 (Integrations, Connect Xero, Demo Company (UK)) ' +
  'on the docs base (pnpm docs:base), then run pnpm docs:teardown to save it.';

export function xeroConnectionFile(): string {
  return process.env.DOCS_XERO_CONNECTION_FILE ?? join(__dirname, '..', 'xero-connection.json');
}

export function readSavedXeroConnection(): SavedXeroConnection | null {
  const file = xeroConnectionFile();
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as SavedXeroConnection;
}

function writeSavedXeroConnection(saved: SavedXeroConnection): void {
  writeFileSync(xeroConnectionFile(), JSON.stringify(saved, null, 2) + '\n');
}

/**
 * Saves the docs distributor's live Xero connection to the file, if there is one. Runs before
 * every clear-down. Returns true when the file changed. Once the file exists only the token
 * is updated: the invoice setting stays as first saved, so a scenario that changes it
 * (xero-invoice-settings) doesn't change every later scenario's starting point.
 */
export async function saveXeroConnection(prisma: PrismaClient, log: (line: string) => void = () => {}): Promise<boolean> {
  const live = await prisma.accountingConnection.findFirst({
    where: { distributorId: DOCS_DISTRIBUTOR_ID, status: AccountingConnectionStatus.CONNECTED },
    orderBy: { connectedAt: 'desc' },
    include: { organisation: true },
  });
  if (!live) return false;

  const previous = readSavedXeroConnection();
  if (
    previous &&
    previous.encryptedCredentialData === live.encryptedCredentialData &&
    previous.externalOrganisationId === live.organisation.externalOrganisationId &&
    previous.scopes === live.scopes
  ) {
    return false;
  }

  writeSavedXeroConnection({
    provider: live.provider,
    externalOrganisationId: live.organisation.externalOrganisationId,
    organisationName: live.organisation.name,
    invoiceExportTargetStatus: previous?.invoiceExportTargetStatus ?? live.organisation.invoiceExportTargetStatus,
    scopes: live.scopes,
    encryptedCredentialData: live.encryptedCredentialData,
    savedAt: new Date().toISOString(),
  });
  log(`Saved the Xero connection (${live.organisation.name}).`);
  return true;
}

export interface ConnectXeroOptions {
  /**
   * false: connected but never synced, and the scheduler is held off until tomorrow, so the
   * app shows "No Xero data has been synced yet". true: the scheduler runs the real first
   * sync straight away, and this waits for it to finish.
   */
  synced: boolean;
  log?: (line: string) => void;
}

/** Puts the saved Xero connection back on Vine & Co. Only the Xero scenarios' seeds call this. */
export async function connectXero(prisma: PrismaClient, { synced, log = () => {} }: ConnectXeroOptions): Promise<void> {
  const saved = readSavedXeroConnection();
  if (!saved) throw new Error(`No saved Xero connection (${xeroConnectionFile()}). ${RECONNECT_HELP}`);

  const now = new Date();
  await prisma.accountingOrganisation.create({
    data: {
      id: DOCS_XERO_ORGANISATION_ID,
      distributorId: DOCS_DISTRIBUTOR_ID,
      provider: saved.provider,
      externalOrganisationId: saved.externalOrganisationId,
      name: saved.organisationName,
      invoiceExportTargetStatus: saved.invoiceExportTargetStatus,
    },
  });
  await prisma.accountingConnection.create({
    data: {
      id: DOCS_XERO_CONNECTION_ID,
      distributorId: DOCS_DISTRIBUTOR_ID,
      accountingOrganisationId: DOCS_XERO_ORGANISATION_ID,
      provider: saved.provider,
      status: AccountingConnectionStatus.CONNECTED,
      scopes: saved.scopes,
      encryptedCredentialData: saved.encryptedCredentialData,
      connectedByUserId: DOCS_USERS.owner.id,
      connectedAt: now,
    },
  });

  if (!synced) {
    await holdOffScheduler(prisma, new Date(now.getTime() + 24 * 60 * 60 * 1000));
    log(`Connected to ${saved.organisationName}; not synced yet.`);
    return;
  }
  log(`Connected to ${saved.organisationName}; waiting for the first sync…`);
  await waitForSync(prisma, now, log);
}

/**
 * Schedule rows that keep the scheduler away until `until`. With no row for a resource the
 * scheduler syncs it at once, so a never-synced connection needs one per resource. The
 * mapping resources (contact, product, tax_type) are FAILED rather than COMPLETED, because
 * the app reads a COMPLETED one as "has synced" and an active one as "syncing"; pressing
 * Sync with Xero reuses the row like any other.
 */
async function holdOffScheduler(prisma: PrismaClient, until: Date): Promise<void> {
  await prisma.ingestionRun.createMany({
    data: ACCOUNTING_SYNC_RESOURCE_TYPES.map((resourceType) => ({
      distributorId: DOCS_DISTRIBUTOR_ID,
      sourceType: ACCOUNTING_SOURCE_TYPE,
      sourceRef: DOCS_XERO_CONNECTION_ID,
      resourceType,
      status: IngestionRunStatus.FAILED,
      trigger: IngestionRunTrigger.SCHEDULED,
      nextRunAt: until,
    })),
  });
}

// The scheduler skips the invoice resource while there are no unpaid invoices, so only these
// prove the first sync has finished.
const FIRST_SYNC_RESOURCES = ['contact', 'product', 'tax_type', 'account'] as const;
const SYNC_TIMEOUT_MS = 5 * 60 * 1000;

type SyncResource = (typeof ACCOUNTING_SYNC_RESOURCE_TYPES)[number];

/** Waits until every one of `resources` has synced successfully since `since`. */
export async function waitForSync(
  prisma: PrismaClient,
  since: Date,
  log: (line: string) => void = () => {},
  resources: readonly SyncResource[] = FIRST_SYNC_RESOURCES,
): Promise<void> {
  const deadline = Date.now() + SYNC_TIMEOUT_MS;
  for (;;) {
    const runs = await prisma.ingestionRun.findMany({
      where: { sourceType: ACCOUNTING_SOURCE_TYPE, sourceRef: DOCS_XERO_CONNECTION_ID, resourceType: { in: [...resources] } },
    });
    const failed = runs.find((r) => r.status === IngestionRunStatus.FAILED && r.finishedAt && r.finishedAt >= since);
    if (failed) throw new Error(`The Xero ${failed.resourceType} sync failed: ${failed.errorMessage ?? 'no reason given'}`);
    const done = resources.filter((type) =>
      runs.some((r) => r.resourceType === type && r.lastSucceededAt && r.lastSucceededAt >= since),
    );
    if (done.length === resources.length) {
      log('Xero sync finished.');
      return;
    }
    const connection = await prisma.accountingConnection.findUnique({ where: { id: DOCS_XERO_CONNECTION_ID } });
    if (connection && connection.status !== AccountingConnectionStatus.CONNECTED) {
      throw new Error(`Xero rejected the saved connection (${connection.lastErrorMessage ?? connection.status}). ${RECONNECT_HELP}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`The Xero sync didn't finish within 5 minutes (done: ${done.join(', ') || 'none'}). Is wholo-worker running?`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/**
 * Makes the scheduler sync `resources` again now (as its own timer would), and waits for it:
 * for a scenario that starts after something changed in Xero.
 */
export async function syncAgain(prisma: PrismaClient, resources: readonly SyncResource[], log: (line: string) => void = () => {}): Promise<void> {
  const since = new Date();
  await prisma.ingestionRun.updateMany({
    where: { sourceType: ACCOUNTING_SOURCE_TYPE, sourceRef: DOCS_XERO_CONNECTION_ID, resourceType: { in: [...resources] } },
    data: { nextRunAt: new Date(since.getTime() - 1000) },
  });
  log(`Waiting for Xero to sync ${resources.join(', ')} again…`);
  await waitForSync(prisma, since, log, resources);
}

// ── Access to the Xero API for the test-data script ────────────────────────────────────────

const XERO_TOKEN_ENDPOINT = 'https://identity.xero.com/connect/token';
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

interface ClusterXeroConfig {
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
}

/**
 * The running API's own Xero settings, read from the cluster: they encrypted the saved token,
 * so apps/api/.env (loaded by the docs CLI, often with blank or different values) must not
 * stand in for them. DOCS_XERO_* variables override for a cluster-less run. Never logged.
 */
function readClusterXeroConfig(): ClusterXeroConfig {
  const kube = (args: string[]) => execFileSync('kubectl', args, { encoding: 'utf8' }).trim();
  const secret = (key: string) => Buffer.from(kube(['get', 'secret', 'wholo-api', '-o', `jsonpath={.data.${key}}`]), 'base64').toString('utf8');
  const config = {
    clientId: process.env.DOCS_XERO_CLIENT_ID || kube(['get', 'configmap', 'wholo-api', '-o', 'jsonpath={.data.XERO_CLIENT_ID}']),
    clientSecret: process.env.DOCS_XERO_CLIENT_SECRET || secret('XERO_CLIENT_SECRET'),
    encryptionKey: process.env.DOCS_XERO_ENCRYPTION_KEY || secret('ACCOUNTING_TOKEN_ENCRYPTION_KEY'),
  };
  for (const [name, value] of Object.entries(config)) {
    if (!value) throw new Error(`The cluster's wholo-api settings have no ${name}; is Xero set up in values.local.yaml?`);
  }
  return config;
}

export interface XeroAccess {
  accessToken: string;
  tenantId: string;
}

/**
 * A working access token for the docs Xero organisation. Uses the live connection if there is
 * one, else the saved file; refreshes the token when it's close to expiry and stores the new
 * one back where it came from, so the next user of the connection isn't left with a dead
 * refresh token.
 */
export async function getXeroAccess(prisma: PrismaClient): Promise<XeroAccess> {
  const config = readClusterXeroConfig();
  const encryption = new TokenEncryptionService({ getOrThrow: () => config.encryptionKey } as unknown as ConfigService);

  const live = await prisma.accountingConnection.findFirst({
    where: { distributorId: DOCS_DISTRIBUTOR_ID, status: AccountingConnectionStatus.CONNECTED },
    orderBy: { connectedAt: 'desc' },
    include: { organisation: true },
  });
  const saved = readSavedXeroConnection();
  if (!live && !saved) throw new Error(`No Xero connection to use. ${RECONNECT_HELP}`);

  const blob = live ? live.encryptedCredentialData : saved!.encryptedCredentialData;
  const tenantId = live ? live.organisation.externalOrganisationId : saved!.externalOrganisationId;
  if (saved && saved.externalOrganisationId !== tenantId) {
    throw new Error('The live Xero connection is to a different organisation from the saved one; refusing to touch it.');
  }

  let tokenSet = JSON.parse(encryption.decrypt(blob)) as AccountingTokenSet;
  if (new Date(tokenSet.expiresAt).getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return { accessToken: tokenSet.accessToken, tenantId };
  }

  tokenSet = await refreshTokenSet(tokenSet, config);
  const newBlob = encryption.encrypt(JSON.stringify(tokenSet));
  if (live) {
    await prisma.accountingConnection.update({ where: { id: live.id }, data: { encryptedCredentialData: newBlob } });
  } else {
    writeSavedXeroConnection({ ...saved!, encryptedCredentialData: newBlob, savedAt: new Date().toISOString() });
  }
  return { accessToken: tokenSet.accessToken, tenantId };
}

async function refreshTokenSet(tokenSet: AccountingTokenSet, config: ClusterXeroConfig): Promise<AccountingTokenSet> {
  const response = await fetch(XERO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenSet.refreshToken }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    scope?: string;
    error?: string;
  };
  if (!response.ok || !body.access_token || !body.refresh_token || body.expires_in == null) {
    throw new Error(`Xero wouldn't refresh the saved token (${body.error ?? response.status}). ${RECONNECT_HELP}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
    idToken: body.id_token ?? tokenSet.idToken,
    scope: body.scope ?? tokenSet.scope,
  };
}
