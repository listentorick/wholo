'use client';

import { StatusBadge } from '@/components/list/StatusBadge';
import type { LinkProblem } from './record-link-config';

// Next to the record's name, only when its link needs attention. Opens the
// Integrations tab, where the problem can be fixed.
export function LinkProblemPill({ problem, onClick }: { problem: LinkProblem; onClick: () => void }) {
  if (!problem) return null;
  return (
    <button type="button" onClick={onClick} aria-label={problem.label} className="rounded-full hover:opacity-80">
      <StatusBadge label={problem.label} tone={problem.tone} />
    </button>
  );
}
