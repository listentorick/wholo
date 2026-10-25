import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard rail (ADR-078): check-admin-build-has-no-ops.mjs finds leaked Ops code
// by its marker, so every Ops module the shared seam can load must carry it.
const src = join(__dirname, '..');
const seam = readFileSync(join(src, 'lib/ops-seam.tsx'), 'utf8');
const loaded = [...new Set([...seam.matchAll(/import\('@\/ops\/([\w/]+)'\)/g)].map((m) => m[1]))];

function source(module: string): string {
  for (const ext of ['.tsx', '.ts']) {
    try {
      return readFileSync(join(src, 'ops', module + ext), 'utf8');
    } catch {
      // try the next extension
    }
  }
  throw new Error(`ops-seam.tsx loads @/ops/${module}, which was not found`);
}

describe('the Ops build marker', () => {
  it('finds the modules the seam loads', () => {
    expect(loaded).toEqual(expect.arrayContaining(['scope', 'SupportBar', 'SidebarParts']));
  });

  it.each(loaded)('is used by @/ops/%s', (module) => {
    expect(source(module)).toMatch(/\bOPS_BUILD_MARKER\b/);
  });
});
