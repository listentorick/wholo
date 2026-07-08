'use client';

interface Props {
  name: string;
  description: string;
}

export function ComingSoonProviderCard({ name, description }: Props) {
  return (
    <div className="rounded-lg border border-border bg-white p-5 opacity-60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text">{name}</h2>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[hsl(var(--color-border)/30%)] px-2.5 py-0.5 text-xs font-medium text-muted">
          Coming soon
        </span>
      </div>
    </div>
  );
}
