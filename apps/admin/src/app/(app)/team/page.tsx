'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminTeamApi } from '@wholo/admin-api-client';
import { Permission, type StaffInvitation, type TeamOverview } from '@wholo/types';
import { DetailTabs } from '@/components/detail/DetailTabs';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { ListSpinner } from '@/components/list/ListSpinner';
import { InviteTeamMemberModal } from '@/components/team/InviteTeamMemberModal';
import { TeamList } from '@/components/team/TeamList';
import { TeamPersonDrawer } from '@/components/team/TeamPersonDrawer';
import { useAuth } from '@/lib/auth-context';
import { buildTeamEntries, countByFilter, matchesFilter, type TeamFilter } from '@/lib/team';

const FILTER_LABELS: Record<TeamFilter, string> = { all: 'All', active: 'Active', pending: 'Pending', expired: 'Expired' };
const EMPTY_TEXT: Record<TeamFilter, string> = {
  all: '',
  active: 'No active team members.',
  pending: 'No pending invitations.',
  expired: 'No expired invitations.',
};

export default function TeamPage() {
  const { user, accessToken } = useAuth();
  const canManage = !!user?.permissions?.includes(Permission.TEAM_MANAGE);

  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TeamFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [justInvitedId, setJustInvitedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await adminTeamApi.overview());
      setError(null);
    } catch {
      setError('Couldn’t load your team. Please refresh.');
    }
  }, []);

  useEffect(() => {
    if (accessToken && canManage) void load();
  }, [accessToken, canManage, load]);

  const entries = useMemo(() => (overview ? buildTeamEntries(overview, user?.id) : []), [overview, user?.id]);
  const counts = useMemo(() => countByFilter(entries), [entries]);
  const visible = entries.filter((e) => matchesFilter(e, filter));
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const justYou = entries.length === 1 && entries[0].kind === 'member' && entries[0].isSelf;

  function invited(invitation: StaffInvitation) {
    setInviting(false);
    setFilter('all');
    setJustInvitedId(invitation.id);
    void load();
  }

  if (user && !canManage) {
    return (
      <>
        <ListPageHeader title="Team" />
        <ListErrorBanner message="Only the Owner can manage the team." />
      </>
    );
  }

  return (
    <>
      <ListPageHeader
        title="Team"
        count={overview ? entries.length : undefined}
        actions={
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Invite team member
          </button>
        }
      />

      {error ? (
        <ListErrorBanner message={error} />
      ) : !overview ? (
        <ListSpinner />
      ) : (
        <>
          <DetailTabs
            tabs={(Object.keys(FILTER_LABELS) as TeamFilter[]).map((key) => ({ key, label: FILTER_LABELS[key], count: counts[key] }))}
            activeKey={filter}
            onChange={setFilter}
          />
          {visible.length === 0 ? (
            <p className="rounded-lg border border-border bg-white px-5 py-8 text-center text-sm text-muted">{EMPTY_TEXT[filter]}</p>
          ) : (
            <TeamList entries={visible} selectedId={selectedId ?? justInvitedId} onSelect={(entry) => { setJustInvitedId(null); setSelectedId(entry.id); }} />
          )}
          {justYou && filter === 'all' && (
            <div className="mt-4">
              <ListEmptyState
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="#1565ff" strokeWidth={1.5} className="h-8 w-8" aria-hidden>
                    <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                }
                title="It’s just you for now"
                description="Invite the people who run orders, the warehouse and deliveries. Each person gets their own sign-in and only the roles you choose."
                action={
                  <button
                    type="button"
                    onClick={() => setInviting(true)}
                    className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
                  >
                    Invite team member
                  </button>
                }
              />
            </div>
          )}
        </>
      )}

      {inviting && <InviteTeamMemberModal onClose={() => setInviting(false)} onInvited={invited} />}
      {selected && (
        <TeamPersonDrawer key={selected.id} entry={selected} onClose={() => setSelectedId(null)} onChanged={() => void load()} />
      )}
    </>
  );
}
