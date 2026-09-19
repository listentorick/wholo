import { ASSIGNABLE_STAFF_ROLES, ROLE_LABELS, Role } from '@wholo/types';
import { OWNER_DESCRIPTION, ROLE_DESCRIPTIONS } from '@/lib/team';

interface RolePickerProps {
  value: Role[];
  onChange: (roles: Role[]) => void;
  disabled?: boolean;
  /** Marks the options as invalid (e.g. nothing chosen yet). */
  invalid?: boolean;
  /** Prefix for input ids — several pickers can be on screen at once. */
  idPrefix: string;
}

/**
 * The roles an Owner may grant, as described checkboxes (multi-select), plus
 * the Owner as a locked row — so it's clear why it's missing, and that it can't
 * be granted by invitation. The server enforces the same rule; this is UX.
 */
export function RolePicker({ value, onChange, disabled, invalid, idPrefix }: RolePickerProps) {
  function toggle(role: Role) {
    onChange(value.includes(role) ? value.filter((r) => r !== role) : [...value, role]);
  }

  return (
    <div className="space-y-2" role="group" aria-label="Roles">
      {ASSIGNABLE_STAFF_ROLES.map((role) => {
        const checked = value.includes(role);
        const id = `${idPrefix}-${role}`;
        return (
          <label
            key={role}
            htmlFor={id}
            className={[
              'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors',
              checked ? 'border-primary/40 bg-primary/5' : invalid ? 'border-red-300 bg-white' : 'border-border bg-white hover:bg-border/10',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            ].join(' ')}
          >
            <input
              id={id}
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(role)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text">{ROLE_LABELS[role]}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{ROLE_DESCRIPTIONS[role]}</span>
            </span>
          </label>
        );
      })}

      <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-[#f8f9fb] px-3 py-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" />
        </svg>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-muted">{ROLE_LABELS[Role.DISTRIBUTOR_ADMIN]}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{OWNER_DESCRIPTION}</span>
        </span>
      </div>
    </div>
  );
}
