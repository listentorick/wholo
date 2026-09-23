import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useEChart } from './use-echart';

const chart = vi.hoisted(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }));
const init = vi.hoisted(() => vi.fn());
vi.mock('echarts/core', () => ({ init, use: vi.fn() }));

function Harness() {
  const { containerRef } = useEChart();
  return <div ref={containerRef} data-testid="chart" />;
}

describe('useEChart', () => {
  let observe: ReturnType<typeof vi.fn>;
  let disconnect: ReturnType<typeof vi.fn>;
  let resizeCallback: () => void;

  beforeEach(() => {
    init.mockReset().mockReturnValue(chart);
    chart.resize.mockClear(); chart.dispose.mockClear();
    observe = vi.fn(); disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { resizeCallback = cb; } observe = observe; disconnect = disconnect; });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('creates one chart on the container it renders', () => {
    const { getByTestId } = render(<Harness />);

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(getByTestId('chart'));
  });

  it('resizes the chart when its container changes size', () => {
    render(<Harness />);

    expect(observe).toHaveBeenCalled();
    resizeCallback();
    expect(chart.resize).toHaveBeenCalledTimes(1);
  });

  it('does not create a second chart on a re-render', () => {
    const { rerender } = render(<Harness />);
    rerender(<Harness />);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('stops watching and disposes the chart when it goes away', () => {
    const { unmount } = render(<Harness />);
    unmount();

    expect(disconnect).toHaveBeenCalled();
    expect(chart.dispose).toHaveBeenCalledTimes(1);
  });

  it('copes with a browser that has no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    expect(() => render(<Harness />)).not.toThrow();
    expect(init).toHaveBeenCalledTimes(1);
  });
});
