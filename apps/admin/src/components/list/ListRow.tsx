interface ListRowProps {
  children: React.ReactNode;
  className?: string;
}

export function ListRow({ children, className }: ListRowProps) {
  return (
    <tr className={`group border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer ${className ?? ''}`}>
      {children}
    </tr>
  );
}
