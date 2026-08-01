type Tone = 'yellow' | 'red';

const TONE_STYLES: Record<Tone, { bg: string; text: string }> = {
  yellow: { bg: '#fef9c3', text: '#a16207' },
  red: { bg: '#fee2e2', text: '#b91c1c' },
};

interface RelationshipStatusBadgeProps {
  label: string;
  tone: Tone;
}

/**
 * Connection-status pill for the portal's "Connect" area — pending or
 * suspended only (no relationship / active render no badge). Ports the
 * {label, tone} pattern from apps/admin's StatusBadge; not shared directly
 * since there's no shared UI package between admin and portal.
 */
export function RelationshipStatusBadge({ label, tone }: RelationshipStatusBadgeProps) {
  const s = TONE_STYLES[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.text }} />
      {label}
    </span>
  );
}
