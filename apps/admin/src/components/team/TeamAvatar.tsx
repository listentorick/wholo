import { initials, type TeamEntry } from '@/lib/team';

const SIZES = { md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm' } as const;

// Encodes state in form: people get a filled initials circle; invitations (no
// person yet) get a dashed envelope, so pending rows read as different in kind.
export function TeamAvatar({ entry, size = 'md' }: { entry: TeamEntry; size?: keyof typeof SIZES }) {
  if (entry.kind === 'invitation') {
    return (
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#b6c2d1] bg-white text-muted ${SIZES[size]}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'}>
          <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${
        entry.isOwner ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
      }`}
    >
      {initials(entry.member)}
    </span>
  );
}
