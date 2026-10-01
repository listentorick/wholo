import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Guards the accounting integration framework against drift (see the overview
// in adapters/accounting-connection-adapter.interface.ts). These read the
// source, so a new file that breaks a rule fails here without anyone having
// to remember to add it to a list.

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path).replace(/\\/g, '/'),
  source: readFileSync(path, 'utf8'),
}));
// Code only — comments may name a provider as an example.
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('accounting integration framework', () => {
  it('every processor on an accounting pull queue extends the pull base', () => {
    const pulls = files.filter((f) => /@Processor\(ACCOUNTING_\w+_SYNC_QUEUE/.test(f.source));
    expect(pulls.length).toBeGreaterThanOrEqual(4); // contact, product, tax type, invoice status
    const offenders = pulls
      .filter((f) => !/extends\s+Accounting(Pull|Sync)ProcessorBase\b/.test(f.source))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('only the pull base drives the ingestion run lifecycle', () => {
    const lifecycle = /ingestionRuns\.(claim|ensureRun|finalizeSuccess|finalizeFailure|requeueForRetry)\(/;
    const offenders = files
      .filter((f) => f.path.startsWith('accounting') && lifecycle.test(code(f.source)))
      .map((f) => f.path);
    expect(offenders).toEqual(['accounting/sync/accounting-pull-processor.base.ts']);
  });

  it('decides "last attempt" in one place', () => {
    const offenders = files
      .filter((f) => f.path.startsWith('accounting') && /\battemptsMade\b/.test(code(f.source)))
      .map((f) => f.path)
      .sort();
    expect(offenders).toEqual(['accounting/accounting-backoff.ts', 'accounting/accounting-job-failure.ts']);
  });

  // Provider specifics stay behind the adapter port. The allow-list is the
  // known provider-specific edges outside it (OAuth entry points and module
  // wiring); generalise them when the second provider lands rather than
  // adding to this list.
  const PROVIDER_EDGES = [
    'accounting/accounting.module.ts',
    'accounting/accounting-connection.controller.ts',
    'accounting/xero-callback.controller.ts',
    'accounting/dto/xero-callback.dto.ts',
  ];
  const isAdapterOrEdge = (path: string) => path.startsWith('accounting/adapters/') || PROVIDER_EDGES.includes(path);

  it('no code outside the adapters imports a provider SDK or a concrete adapter', () => {
    const importsProvider = /from\s+['"](xero-node|[^'"]*\/xero-[^'"]*)['"]/;
    const offenders = files.filter((f) => !isAdapterOrEdge(f.path) && importsProvider.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('no code outside the adapters branches on a specific provider', () => {
    const offenders = files
      .filter((f) => !isAdapterOrEdge(f.path) && /AccountingProvider\.[A-Z]/.test(code(f.source)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('user-facing text never hard-codes a provider name — adapters supply displayName', () => {
    const offenders = files
      .filter((f) => !isAdapterOrEdge(f.path) && /['"`][^'"`\n]*\b(Xero|XERO)\b[^'"`\n]*['"`]/.test(code(f.source)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
