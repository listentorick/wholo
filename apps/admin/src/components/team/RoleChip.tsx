import { Role } from '@wholo/types';
import { roleLabel } from '@/lib/team';

// The Owner chip is deliberately the one dark chip on the page, so the Owner
// reads as different in kind from the roles that can be granted.
export function RoleChip({ role }: { role: Role }) {
  const owner = role === Role.DISTRIBUTOR_ADMIN || role === Role.PLATFORM_ADMIN;
  return (
    <span
      className={[
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        owner ? 'border-text bg-text text-white' : 'border-primary/25 bg-primary/5 text-primary-hover',
      ].join(' ')}
    >
      {roleLabel(role)}
    </span>
  );
}

export function RoleChips({ roles }: { roles: Role[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <RoleChip key={r} role={r} />
      ))}
    </div>
  );
}
