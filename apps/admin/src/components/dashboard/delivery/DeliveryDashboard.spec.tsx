import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { adminDeliveryOverviewApi } from '@wholo/admin-api-client';
import { DeliveryDashboard } from './DeliveryDashboard';
import { outcomesFixture, overviewFixture } from './fixtures';

vi.mock('@wholo/admin-api-client', () => ({
  adminDeliveryOverviewApi: { get: vi.fn(), outcomes: vi.fn() },
}));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'token' }) }));

// The chart itself is covered in OutcomeChart.spec / outcomeChartOption.spec; jsdom has no canvas.
vi.mock('echarts/core', () => ({ init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })), use: vi.fn() }));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, GaugeChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const tiles = () => screen.findByRole('group', { name: /needs attention/i });
// The chart's "View as table" fallback is a table too, so the queue's is found by its section.
const queueTable = () => within(screen.getByRole('region', { name: 'Needs doing' })).getByRole('table');
const tile = async (name: RegExp) => within(await tiles()).getByRole('button', { name });

const api = adminDeliveryOverviewApi as unknown as { get: ReturnType<typeof vi.fn>; outcomes: ReturnType<typeof vi.fn> };

describe('DeliveryDashboard', () => {
  beforeEach(() => {
    api.get.mockReset().mockResolvedValue(overviewFixture());
    api.outcomes.mockReset().mockResolvedValue(outcomesFixture());
  });

  it('shows a loading state, then the day', async () => {
    render(<DeliveryDashboard />);

    expect(screen.getByLabelText(/loading today/i)).toBeInTheDocument();
    expect(await tile(/to accept/i)).toHaveTextContent('4');
    expect(screen.getByText('Last updated 12:24')).toBeInTheDocument();
    expect(screen.getByText('R1 North')).toBeInTheDocument();
    expect(screen.getByText('63%')).toBeInTheDocument();
  });

  it("asks for the seven completed days before the distributor's today, once it knows what today is", async () => {
    render(<DeliveryDashboard />);

    await screen.findByText('R1 North');
    await waitFor(() => expect(api.outcomes).toHaveBeenCalled());
    expect(api.outcomes.mock.calls[0].slice(0, 2)).toEqual(['2026-09-11', '2026-09-17']);
  });

  it("draws today's live figures as the last bar of the chart", async () => {
    render(<DeliveryDashboard />);

    const chart = await screen.findByRole('img', { name: /deliveries by outcome/i });
    expect(chart.getAttribute('aria-label')).toContain('Fri 18 (today, in progress): 32 on time, 0 late, 2 failed, 17 still to do');
  });

  it('shows a clear error and a way to retry when the first load fails', async () => {
    api.get.mockRejectedValueOnce(new Error('boom'));
    render(<DeliveryDashboard />);

    expect(await screen.findByText(/could not load today/i)).toBeInTheDocument();
    api.get.mockResolvedValue(overviewFixture());
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('R1 North')).toBeInTheDocument();
  });

  it('keeps the tiles up when only the history fails', async () => {
    api.outcomes.mockImplementation(() => Promise.reject(new Error('facts down')));
    render(<DeliveryDashboard />);

    expect(await screen.findByText(/could not load the last seven days/i)).toBeInTheDocument();
    expect(await tile(/to accept/i)).toHaveTextContent('4');
    expect(screen.getByText('R1 North')).toBeInTheDocument();
  });

  it('filters the list when a tile is clicked, and back again', async () => {
    render(<DeliveryDashboard />);
    await screen.findByText('R1 North');

    await userEvent.click(await tile(/^overdue/i));
    const rows = within(queueTable()).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Baker & Co')).toBeInTheDocument();

    await userEvent.click(await tile(/^overdue/i));
    expect(within(queueTable()).getAllByRole('row').slice(1)).toHaveLength(4);
  });

  it('refreshes on demand without re-fetching the history', async () => {
    render(<DeliveryDashboard />);
    await screen.findByText('R1 North');
    await waitFor(() => expect(api.outcomes).toHaveBeenCalledTimes(1));

    api.get.mockResolvedValue(overviewFixture({ generatedAt: '2026-09-18T11:40:00.000Z' }));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Last updated 12:40')).toBeInTheDocument();
    expect(api.outcomes).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the last snapshot, and says so, when a refresh fails', async () => {
    render(<DeliveryDashboard />);
    await screen.findByText('R1 North');

    api.get.mockRejectedValue(new Error('blip'));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText(/could not refresh — showing the snapshot from 12:24/i)).toBeInTheDocument();
    expect(screen.getByText('R1 North')).toBeInTheDocument();
  });

  it('is a calm all-clear on a quiet morning', async () => {
    api.get.mockResolvedValue(overviewFixture({
      counts: { toAccept: { count: 0, oldestSubmittedAt: null }, overdue: { count: 0 }, notOnRun: { count: 0 }, failedLast24h: { count: 0 } },
      progress: { planned: 0, delivered: 0, failed: 0, remaining: 0 }, runs: [], queue: [],
    }));
    render(<DeliveryDashboard />);

    expect(await screen.findByText(/nothing needs doing right now/i)).toBeInTheDocument();
    expect(screen.getAllByText('All clear')).toHaveLength(4);
    expect(screen.getByText(/no runs planned for today/i)).toBeInTheDocument();
  });

  describe('with more than one dashboard to choose from', () => {
    const nav = () => ({ tabs: [{ key: 'delivery' as const, label: 'Delivery' }, { key: 'sales' as const, label: 'Sales' }], activeKey: 'delivery' as const, onChange: vi.fn() });

    it('keeps the tabs and the refresh control on one bar', async () => {
      render(<DeliveryDashboard nav={nav()} />);

      const refresh = await screen.findByRole('button', { name: 'Refresh' });
      const bar = refresh.closest('div.border-b')!;
      expect(bar.contains(screen.getByRole('button', { name: 'Delivery' }))).toBe(true);
      expect(bar.contains(screen.getByRole('button', { name: 'Sales' }))).toBe(true);
      expect(bar.contains(screen.getByText(/last updated/i))).toBe(true);
    });

    it('shows the tabs while it is still loading, so you can leave', async () => {
      render(<DeliveryDashboard nav={nav()} />);

      expect(screen.getByLabelText(/loading today/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument();
      await screen.findByText('R1 North');
    });

    it('shows the tabs when it failed to load, so you can leave', async () => {
      api.get.mockRejectedValueOnce(new Error('boom'));
      render(<DeliveryDashboard nav={nav()} />);

      expect(await screen.findByText(/could not load today/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument();
    });

    it('switches to the other dashboard from the tab', async () => {
      const n = nav();
      render(<DeliveryDashboard nav={n} />);
      await screen.findByText('R1 North');

      await userEvent.click(screen.getByRole('button', { name: 'Sales' }));

      expect(n.onChange).toHaveBeenCalledWith('sales');
    });
  });

  it('with only this dashboard there are no tabs, just the refresh control', async () => {
    render(<DeliveryDashboard />);

    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sales' })).not.toBeInTheDocument();
  });
});
