interface FormCardProps {
  title?: string;
  description?: string;
  /** Shown on the right of the header, e.g. a status or source for the card's contents. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function FormCard({ title, description, actions, children }: FormCardProps) {
  return (
    <div className="rounded-lg border border-border bg-white">
      {title && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="ml-auto flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
