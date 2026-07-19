interface ListEmptyStateProps {
  icon: React.ReactNode;
  iconBgClassName?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function ListEmptyState({
  icon,
  iconBgClassName = 'bg-primary/10',
  title,
  description,
  action,
}: ListEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-white py-20 px-8 text-center">
      <div className={`mb-6 flex h-24 w-24 items-center justify-center rounded-2xl ${iconBgClassName}`}>
        {icon}
      </div>
      <h2 className="mb-2 text-lg font-semibold text-text">{title}</h2>
      <p className="mb-8 max-w-xs text-sm text-muted leading-relaxed">{description}</p>
      {action}
    </div>
  );
}
