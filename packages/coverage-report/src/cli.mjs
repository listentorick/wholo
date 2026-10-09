#!/usr/bin/env node
// `pnpm test:coverage` — the one coverage command, used identically locally and
// in CI (.github/workflows/build-images.yml). Runs every package's unit tests
// with coverage, then prints and validates the combined report. The rules are
// in report.mjs; see docs/testing/coverage.md.
//
// Arguments are passed through to turbo, e.g.
//   pnpm test:coverage --filter=@wholo/types
//   pnpm test:coverage --concurrency=1 -- --maxWorkers=3

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, readPackageSummary, renderMarkdown, resolveThresholds, toOutputs } from './report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKSPACE_DIRS = ['apps', 'packages'];
const REPORT_DIR = path.join(ROOT, 'coverage');

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Every workspace package that has a `test:cov` script is expected to report. */
function discoverPackages() {
  const found = [];
  for (const group of WORKSPACE_DIRS) {
    const groupDir = path.join(ROOT, group);
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(groupDir, entry.name, 'package.json');
      if (!existsSync(manifest)) continue;
      const pkg = readJson(manifest);
      if (pkg.scripts?.['test:cov']) {
        found.push({ name: pkg.name, dir: path.join(groupDir, entry.name) });
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function collect(pkg, filtered) {
  const summaryFile = path.join(pkg.dir, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryFile)) {
    // A filtered local run leaves the other packages out on purpose.
    return { name: pkg.name, status: filtered ? 'skipped' : 'missing' };
  }
  let metrics = null;
  try {
    metrics = readPackageSummary(readJson(summaryFile));
  } catch {
    metrics = null;
  }
  return metrics ? { name: pkg.name, status: 'ok', metrics } : { name: pkg.name, status: 'invalid' };
}

function main() {
  // A leading `--` is only pnpm's separator; a later one hands the rest to the
  // test runners (turbo's own convention), e.g. `-- --maxWorkers=3`.
  const turboArgs = process.argv.slice(2);
  if (turboArgs[0] === '--') turboArgs.shift();
  const filtered = turboArgs.some((arg) => arg === '-F' || arg.startsWith('--filter'));

  // Fail on a bad threshold before spending minutes on the test run.
  const thresholds = resolveThresholds(readJson(path.join(ROOT, 'coverage.thresholds.json')), process.env);

  // Remove every earlier report first, so nothing stale can be read as current.
  const packages = discoverPackages();
  for (const pkg of packages) {
    rmSync(path.join(pkg.dir, 'coverage'), { recursive: true, force: true });
  }
  rmSync(REPORT_DIR, { recursive: true, force: true });

  // --continue: a failing package does not stop the others from reporting.
  const turbo = spawnSync('pnpm', ['exec', 'turbo', 'run', 'test:cov', '--continue', ...turboArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const testsPassed = turbo.status === 0;

  const report = evaluate({
    packages: packages.map((pkg) => collect(pkg, filtered)),
    thresholds,
    testsPassed,
  });
  const markdown = renderMarkdown(report, {
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA,
  });

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path.join(REPORT_DIR, 'summary.md'), markdown);
  writeFileSync(path.join(REPORT_DIR, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('\n' + markdown);
  console.log('HTML reports: <package>/coverage/index.html · combined: coverage/summary.md');

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  }
  if (process.env.GITHUB_OUTPUT) {
    const outputs = Object.entries(toOutputs(report)).map(([key, value]) => `${key}=${value}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, outputs.join(''));
  }

  process.exitCode = report.result === 'fail' ? 1 : 0;
}

try {
  main();
} catch (error) {
  console.error(`test:coverage: ${error.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Unit test coverage\n\n❌ ${error.message}\n`);
  }
  process.exitCode = 2;
}
