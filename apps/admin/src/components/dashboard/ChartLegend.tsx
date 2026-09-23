export interface ChartLegendItem {
  label: string;
  color: string;
  /** line (default), dashed line, filled box, or a hatched box for "still to come". */
  variant?: 'line' | 'dashed' | 'box' | 'hatch';
}

function Swatch({ color, variant = 'line' }: Pick<ChartLegendItem, 'color' | 'variant'>) {
  if (variant === 'box') return <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />;
  if (variant === 'hatch') {
    return (
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-sm border"
        style={{ borderColor: color, background: `repeating-linear-gradient(45deg,#EEF3FB 0 3px,${color} 3px 5px)` }}
      />
    );
  }
  if (variant === 'dashed') return <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: color }} />;
  return <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: color }} />;
}

// The dashboards' chart legend. Text carries the series meaning, so the chart
// never relies on colour alone.
export function ChartLegend({ items }: { items: ChartLegendItem[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-secondary">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <Swatch color={item.color} variant={item.variant} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
