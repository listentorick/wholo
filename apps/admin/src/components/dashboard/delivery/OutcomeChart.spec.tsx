import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutcomeChart } from './OutcomeChart';
import { outcomeBars } from './delivery';
import { outcomesFixture, overviewFixture } from './fixtures';

// ECharts needs a real canvas backend, which jsdom doesn't provide — mock it at
// the module boundary, as OrderTrendChart.spec does. The chart's content is tested
// as data in outcomeChartOption.spec.ts; this covers what the component itself does.
const chart = vi.hoisted(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }));
vi.mock('echarts/core', () => ({ init: vi.fn(() => chart), use: vi.fn() }));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const overview = overviewFixture();
const days = outcomesFixture().days;
const bars = outcomeBars(days, overview);

describe('OutcomeChart', () => {
  beforeEach(() => { chart.setOption.mockClear(); chart.dispose.mockClear(); });

  it('hands the chart the bars it was given, replacing what was drawn before', () => {
    render(<OutcomeChart bars={bars} history={days} />);

    expect(chart.setOption).toHaveBeenCalledTimes(1);
    const [option, notMerge] = chart.setOption.mock.calls[0];
    expect(option.xAxis.data).toHaveLength(8);
    expect(notMerge).toBe(true);
  });

  it('redraws when the data changes, and tidies up when it goes away', () => {
    const { rerender, unmount } = render(<OutcomeChart bars={bars} history={days} />);
    rerender(<OutcomeChart bars={bars.slice(0, 3)} history={days} />);

    expect(chart.setOption).toHaveBeenCalledTimes(2);
    expect(chart.setOption.mock.calls[1][0].xAxis.data).toHaveLength(3);
    unmount();
    expect(chart.dispose).toHaveBeenCalled();
  });

  it('has an accessible name that says what happened each day, including that today is in progress', () => {
    render(<OutcomeChart bars={bars} history={days} />);

    const name = screen.getByRole('img', { name: /deliveries by outcome/i }).getAttribute('aria-label')!;
    expect(name).toContain('Fri 18 (today, in progress): 32 on time, 0 late, 2 failed, 17 still to do');
    expect(name).toContain('Mon 14: 58 on time, 4 late, 2 failed');
  });

  it('has a legend for every series, in text', () => {
    render(<OutcomeChart bars={bars} history={days} />);
    for (const label of ['On time', 'Late', 'Failed', 'Still to do (today)', 'Planned']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it('headlines the on-time rate of the completed days, saying today is excluded because it is still in progress', () => {
    render(<OutcomeChart bars={bars} history={days} />);
    // 289 on time of 308 across the completed days
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText(/delivered on the day committed/i)).toBeInTheDocument();
    expect(screen.getByText(/last 7 completed days \(today is still in progress\)/i)).toBeInTheDocument();
  });

  it('says so, instead of a misleading 0%, when there is no history yet — and still charts today', () => {
    render(<OutcomeChart bars={outcomeBars([], overview)} history={[]} />);

    expect(screen.getByText(/nothing on record for the previous days yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/delivered on the day committed/i)).not.toBeInTheDocument();
    expect(chart.setOption.mock.calls[0][0].xAxis.data).toEqual(['Today']);
  });

  it('exposes every value through the "View as table" fallback', async () => {
    render(<OutcomeChart bars={bars} history={days} />);

    await userEvent.click(screen.getByText('View as table'));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(9); // header + 8 days
    const today = within(table).getByText('Fri 18 (today)').closest('tr')!;
    expect(today).toHaveTextContent('32');
    expect(today).toHaveTextContent('17');
    expect(today).toHaveTextContent('51');
  });
});
