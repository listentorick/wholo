'use client';

import { useMemo, useState } from 'react';
import type { OrderTrendPoint } from '@wholo/types';

interface Props {
  current: OrderTrendPoint[];
  comparison: OrderTrendPoint[];
  comparisonLabel: string;
}

const WIDTH = 720;
const HEIGHT = 260;
// right is wide enough for the current-value end-label (e.g. "£12,345") so it
// never clips against the card edge (dataviz skill: a label that won't fit
// doesn't get clipped — it needs room, not truncation).
const PADDING = { top: 16, right: 64, bottom: 28, left: 56 };

// Wholo's own brand pair (Cobalt Blue / Amber) — validated via the dataviz
// skill's six-checks script (worst-pair CVD ΔE 31.5 light, normal-vision
// ΔE 40.8), rather than the skill's generic default palette, for
// consistency with the rest of the app's branding. Amber's contrast vs. the
// white chart surface falls below 3:1 (a documented WARN), which is why
// this chart never relies on color alone: the legend, direct end-labels and
// tooltip all carry the series name in text too.
const CURRENT_COLOR = '#1565FF';
const COMPARISON_COLOR = '#F2864D';

function formatCurrency(value: number): string {
  return `£${value.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return value;
}

export function OrderTrendChart({ current, comparison, comparisonLabel }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const pointCount = current.length;

  const maxValue = useMemo(
    () => niceMax(Math.max(0, ...current.map((p) => p.value), ...comparison.map((p) => p.value))),
    [current, comparison],
  );

  const xFor = (index: number) => (pointCount <= 1 ? 0 : (index / (pointCount - 1)) * plotWidth);
  const yFor = (value: number) => plotHeight - (maxValue === 0 ? 0 : (value / maxValue) * plotHeight);

  const linePath = (points: OrderTrendPoint[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(' ');

  if (pointCount === 0) {
    return <p className="text-sm text-muted">No data for this period yet.</p>;
  }

  const hovered = hoverIndex !== null ? { current: current[hoverIndex], comparison: comparison[hoverIndex] } : null;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs font-medium text-secondary">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
          This period
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: COMPARISON_COLOR }} />
          {comparisonLabel}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Order value trend, current period vs. previous period"
        className="w-full"
      >
        <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
          {gridLines.map((fraction) => {
            const y = plotHeight * (1 - fraction);
            return (
              <g key={fraction}>
                <line x1={0} x2={plotWidth} y1={y} y2={y} stroke="#e1e0d9" strokeWidth={1} />
                <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[10px]">
                  {formatCurrency(maxValue * fraction)}
                </text>
              </g>
            );
          })}

          <path d={linePath(comparison)} fill="none" stroke={COMPARISON_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={linePath(current)} fill="none" stroke={CURRENT_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {current.length > 0 && (
            <text
              x={xFor(current.length - 1) + 6}
              y={yFor(current[current.length - 1].value)}
              dominantBaseline="middle"
              className="fill-text text-[11px] font-semibold"
            >
              {formatCurrency(current[current.length - 1].value)}
            </text>
          )}

          {hovered && (
            <>
              <line
                x1={xFor(hoverIndex!)}
                x2={xFor(hoverIndex!)}
                y1={0}
                y2={plotHeight}
                stroke="#c3c2b7"
                strokeWidth={1}
              />
              <circle cx={xFor(hoverIndex!)} cy={yFor(hovered.current.value)} r={4} fill={CURRENT_COLOR} stroke="#fcfcfb" strokeWidth={2} />
              <circle cx={xFor(hoverIndex!)} cy={yFor(hovered.comparison.value)} r={4} fill={COMPARISON_COLOR} stroke="#fcfcfb" strokeWidth={2} />
            </>
          )}

          {/* Invisible hit columns — wider than the line itself, one per data point */}
          {current.map((_, i) => (
            <rect
              key={i}
              x={xFor(i) - plotWidth / pointCount / 2}
              y={0}
              width={plotWidth / pointCount}
              height={plotHeight}
              fill="transparent"
              onPointerEnter={() => setHoverIndex(i)}
              onPointerLeave={() => setHoverIndex((prev) => (prev === i ? null : prev))}
              onFocus={() => setHoverIndex(i)}
              tabIndex={0}
              role="button"
              aria-label={`${current[i].date}: ${formatCurrency(current[i].value)} this period, ${formatCurrency(comparison[i]?.value ?? 0)} ${comparisonLabel.toLowerCase()}`}
            />
          ))}
        </g>
      </svg>

      {hovered && (
        <div className="mt-2 rounded-md border border-border bg-white px-3 py-2 text-xs shadow-sm" role="status">
          <p className="font-medium text-text">{hovered.current.date}</p>
          <p className="mt-1 flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
            <span className="font-semibold text-text">{formatCurrency(hovered.current.value)}</span>
            <span className="text-muted">this period</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: COMPARISON_COLOR }} />
            <span className="font-semibold text-text">{formatCurrency(hovered.comparison.value)}</span>
            <span className="text-muted">{comparisonLabel.toLowerCase()}</span>
          </p>
        </div>
      )}

      {/* Table view — the accessible, always-reachable fallback for every value the chart shows. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-text">View as table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-canvas">
              <tr>
                <th className="px-3 py-1.5 font-semibold text-muted">Date</th>
                <th className="px-3 py-1.5 font-semibold text-muted">This period</th>
                <th className="px-3 py-1.5 font-semibold text-muted">{comparisonLabel}</th>
              </tr>
            </thead>
            <tbody>
              {current.map((point, i) => (
                <tr key={point.date} className="border-t border-border">
                  <td className="px-3 py-1.5 text-text">{point.date}</td>
                  <td className="px-3 py-1.5 tabular-nums text-text">{formatCurrency(point.value)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-text">{formatCurrency(comparison[i]?.value ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
