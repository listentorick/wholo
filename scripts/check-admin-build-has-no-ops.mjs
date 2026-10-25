#!/usr/bin/env node
// Guard rail (ADR-078): the admin build of apps/admin must contain no Ops code.
// Run after `next build` without NEXT_PUBLIC_APP_MODE. Fails if any /ops route
// was built, or if the Ops marker string reached the shipped JavaScript.
// Usage: node scripts/check-admin-build-has-no-ops.mjs [path/to/.next]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = '__STOCDUP_OPS__';
const nextDir = process.argv[2] ?? 'apps/admin/.next';
const problems = [];

const routes = Object.values(JSON.parse(readFileSync(join(nextDir, 'app-path-routes-manifest.json'), 'utf8')));
for (const route of routes) {
  if (route === '/ops' || route.startsWith('/ops/')) problems.push(`route ${route} is in the admin build`);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.js') && readFileSync(path, 'utf8').includes(MARKER)) problems.push(`${path} contains Ops code (${MARKER})`);
  }
}
walk(join(nextDir, 'static'));
walk(join(nextDir, 'server', 'app'));

if (problems.length > 0) {
  console.error(`Ops code leaked into the admin build:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Admin build has no Ops code (${routes.length} routes checked).`);
