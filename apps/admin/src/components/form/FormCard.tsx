interface FormCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export function FormCard({ title, description, children }: FormCardProps) {
  return (
    <div className="rounded-lg border border-border bg-white">
      {title && (
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
