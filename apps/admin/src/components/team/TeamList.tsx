'use client';

import { ListRow } from '@/components/list/ListRow';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { StatusBadge } from '@/components/list/StatusBadge';
import { entryRoles, entryStatus, entryTitle, type TeamEntry } from '@/lib/team';
import { RoleChips } from './RoleChip';
import { TeamAvatar } from './TeamAvatar';

interface TeamListProps {
  entries: TeamEntry[];
  selectedId: string | null;
  onSelect: (entry: TeamEntry) => void;
}

function Chevron({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden
      className={`h-5 w-5 shrink-0 ${selected ? 'text-primary' : 'text-[#98a4b3]'}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function Title({ entry }: { entry: TeamEntry }) {
  const { primary, secondary } = entryTitle(entry);
  return (
    <div className="min-w-0">
      <span className="block break-words text-sm font-medium text-text">
        {primary}
        {entry.kind === 'member' && entry.isSelf && <span className="ml-1 font-normal text-muted">(You)</span>}
      </span>
      <span className="mt-0.5 block break-words text-xs text-muted">{secondary}</span>
    </div>
  );
}

/**
 * The whole row is the tap target and opens the person drawer — there is no
 * per-row menu, so every action lives in one place and works the same on a
 * phone. Desktop is a table; below `md` it becomes a card list (the same
 * table-to-cards split every list page in this app uses).
 */
export function TeamList({ entries, selectedId, onSelect }: TeamListProps) {
  return (
    <ListTableShell>
      <table className="hidden w-full text-left md:table">
        <thead className="border-b border-border bg-[#fafafa]">
          <tr>
            <ListTh>Person</ListTh>
            <ListTh>Roles</ListTh>
            <ListTh>Status</ListTh>
            <ListTh className="w-12">
              <span className="sr-only">Open</span>
            </ListTh>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const status = entryStatus(entry);
            const selected = entry.id === selectedId;
            const open = () => onSelect(entry);
            return (
              <ListRow key={entry.id} className={selected ? 'bg-primary/5' : ''}>
                <td className="py-3 pl-5 pr-4">
                  <button type="button" onClick={open} className="flex w-full items-center gap-3 text-left" aria-label={`Open ${entryTitle(entry).primary}`}>
                    <TeamAvatar entry={entry} />
                    <Title entry={entry} />
                  </button>
                </td>
                <td className="px-4 py-3"><RoleChipsCell entry={entry} onOpen={open} /></td>
                <td className="px-4 py-3">
                  <button type="button" onClick={open} tabIndex={-1} className="block text-left">
                    <StatusBadge label={status.label} tone={status.tone} />
                    <span className="mt-1 block text-xs text-muted">{status.line}</span>
                  </button>
                </td>
                <td className="py-3 pl-4 pr-5 text-right">
                  <button type="button" onClick={open} tabIndex={-1} aria-hidden><Chevron selected={selected} /></button>
                </td>
              </ListRow>
            );
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-border md:hidden">
        {entries.map((entry) => {
          const status = entryStatus(entry);
          return (
            <li key={entry.id} className={entry.id === selectedId ? 'bg-primary/5' : ''}>
              <button type="button" onClick={() => onSelect(entry)} className="flex w-full items-start gap-3 px-4 py-3 text-left" aria-label={`Open ${entryTitle(entry).primary}`}>
                <TeamAvatar entry={entry} />
                <span className="min-w-0 flex-1">
                  <Title entry={entry} />
                  <span className="mt-2 block"><RoleChips roles={entryRoles(entry)} /></span>
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <StatusBadge label={status.label} tone={status.tone} />
                    {status.line}
                  </span>
                </span>
                <span className="self-center"><Chevron selected={false} /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </ListTableShell>
  );
}

function RoleChipsCell({ entry, onOpen }: { entry: TeamEntry; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} tabIndex={-1} className="block text-left">
      <RoleChips roles={entryRoles(entry)} />
    </button>
  );
}
