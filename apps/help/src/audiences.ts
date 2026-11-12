import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The help site's reader groups, in menu order. Written by the scenario-docs skill
// (relayout.py) from documentation/scenarios/scenario-docs.yml: only audiences that
// have at least one page are listed. Used at build time by sidebars.ts and the navbar.
export interface Audience {
  id: string;
  label: string;
  first: string; // path of the audience's first page, relative to the docs folder
}

export function readAudiences(): Audience[] {
  const file = join(__dirname, '../../../documentation/docs/_audiences.json');
  return JSON.parse(readFileSync(file, 'utf-8')) as Audience[];
}
