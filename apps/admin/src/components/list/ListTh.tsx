type ListThProps = React.ThHTMLAttributes<HTMLTableCellElement>;

export function ListTh({ children, className = '', ...rest }: ListThProps) {
  return (
    <th
      className={`py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted first:pl-5 last:pr-5 ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}
