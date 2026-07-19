interface ListTableShellProps {
  children: React.ReactNode;
  className?: string;
}

export function ListTableShell({ children, className }: ListTableShellProps) {
  return (
    <div className={`rounded-lg border border-border bg-white overflow-hidden ${className ?? ''}`}>
      {children}
    </div>
  );
}
