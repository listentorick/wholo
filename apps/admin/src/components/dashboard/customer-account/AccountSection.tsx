import type { ReactNode } from 'react';

// One question the dashboard answers ("How exposed are we?"): a white card
// with the question as its heading, a short subtitle and its content.
export function AccountSection({ id, title, subtitle, children }: { id: string; title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-lg border border-border bg-white p-5 sm:p-6" aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="text-base font-semibold text-text">{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export interface MetricTileConfig {
  label: string;
  value: ReactNode;
  /** One or two short lines under the value. */
  captions: ReactNode[];
  tone?: 'default' | 'bad';
}

// A row of small bordered figures that wrap onto more rows as the width shrinks.
export function MetricTiles({ tiles, minWidth = 200 }: { tiles: MetricTileConfig[]; minWidth?: number }) {
  return (
    <dl className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${minWidth}px, 100%), 1fr))` }}>
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-border px-4 py-3.5">
          <dt className="text-xs text-muted">{tile.label}</dt>
          <dd className={`mt-0.5 text-xl font-semibold ${tile.tone === 'bad' ? 'text-red-700' : 'text-text'}`}>{tile.value}</dd>
          {tile.captions.map((caption, i) => (
            <dd key={i} className="text-xs text-muted">{caption}</dd>
          ))}
        </div>
      ))}
    </dl>
  );
}
