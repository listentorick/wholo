interface Props {
  columns: string[];
  rows: Array<Array<string | number>>;
}

// The accessible, always-reachable fallback for every value a chart shows.
// Load-bearing for accessibility now that the plot itself is canvas-rendered.
export function ChartTableFallback({ columns, rows }: Props) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-muted hover:text-text">View as table</summary>
      <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-canvas">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-1.5 font-semibold text-muted">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {row.map((cell, j) => (
                  <td key={j} className={`px-3 py-1.5 text-text ${j > 0 ? 'tabular-nums' : ''}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
