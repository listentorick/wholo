import type { ReactNode } from 'react';

interface MobileCardFieldProps {
  label: string;
  value: ReactNode;
  // 'muted' is for supplementary text (e.g. a match-reason explanation) that
  // should read as secondary to the primary label/value pairs on the card.
  tone?: 'default' | 'muted';
  // Technical identifiers (provider codes, account numbers) render in
  // monospace so they read as data rather than colliding — visually and
  // optically — with the uppercase label above them.
  mono?: boolean;
}

// Shared label/value block for MobileCardList's expanded panel — keeps the
// heading/content hierarchy consistent across every accounting table instead
// of each one reimplementing (and potentially drifting from) the pairing.
export function MobileCardField({ label, value, tone = 'default', mono = false }: MobileCardFieldProps) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted/75">{label}</p>
      <p
        className={[
          'mt-1',
          tone === 'muted' ? 'text-xs text-muted' : 'text-sm font-medium text-text',
          mono ? 'font-mono' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </p>
    </div>
  );
}
