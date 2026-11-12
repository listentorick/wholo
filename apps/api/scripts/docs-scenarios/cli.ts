/**
 * Starting data for the help-site scenarios (documentation/scenarios/), local database only.
 *
 *   pnpm docs:base                  clear the docs data, then create the base (Vine & Co, ready)
 *   pnpm docs:seed <scenario>       back to the base, then that scenario's starting data
 *   pnpm docs:teardown              back to the base (undoes whatever a run did)
 *   pnpm docs:clear                 remove the docs data entirely, base included
 *   pnpm docs:xero-data             put Demo Company (UK) back into the Xero scenarios' known state
 *   pnpm docs:mail <address> [subject words]   save the newest email to <address> (in MailHog) as an HTML file
 *
 * Needs DATABASE_URL pointing at localhost (port-forward Postgres first).
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { clearAll, resetToBase, seedScenario } from './lib/commands';
import { resetXeroData } from './lib/xero-data';
import { newestMailTo } from './lib/mailbox';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

async function main() {
  const [command, scenario] = process.argv.slice(2);
  const prisma = new PrismaClient();
  const log = (line: string) => console.log(line);
  try {
    switch (command) {
      case 'base':
      case 'teardown':
        await resetToBase(prisma, log);
        break;
      case 'seed': {
        if (!scenario) throw new Error('Usage: docs:seed <scenario>');
        const output = await seedScenario(prisma, scenario, log);
        const dir = join(REPO_ROOT, '.scenario-docs', 'runs', scenario);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'seed-output.json'), JSON.stringify(output, null, 2) + '\n');
        if (Object.keys(output).length) log(`Wrote ${join('.scenario-docs', 'runs', scenario, 'seed-output.json')}`);
        break;
      }
      case 'clear':
        await clearAll(prisma, log);
        break;
      case 'mail': {
        if (!scenario) throw new Error('Usage: docs:mail <address> [subject words]');
        const subject = process.argv.slice(4).join(' ') || undefined;
        const email = await newestMailTo(scenario, { subject });
        const dir = join(REPO_ROOT, '.scenario-docs', 'mail');
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${scenario.replace(/[^a-z0-9@._-]/gi, '_')}.html`);
        writeFileSync(file, email.html);
        log(`Subject: ${email.subject}`);
        log(`file://${file}`);
        break;
      }
      case 'xero-data':
        await resetXeroData(prisma, undefined, log);
        break;
      default:
        throw new Error('Usage: cli.ts base | seed <scenario> | teardown | clear | xero-data | mail <address>');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
