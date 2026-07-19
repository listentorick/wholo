export type StatusTone = 'green' | 'yellow' | 'red' | 'gray' | 'blue' | 'orange';

interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
}

const TONE_STYLES: Record<StatusTone, { bg: string; text: string }> = {
  green: { bg: '#dcfce7', text: '#15803d' },
  yellow: { bg: '#fef9c3', text: '#a16207' },
  red: { bg: '#fee2e2', text: '#b91c1c' },
  gray: { bg: '#f3f4f6', text: '#6b7280' },
  blue: { bg: '#dbeafe', text: '#1d4ed8' },
  orange: { bg: '#fef3ec', text: '#d97036' },
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
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
