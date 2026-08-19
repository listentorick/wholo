import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DeliveryRunColumn } from '@wholo/types';
import { RunColumn } from './RunColumn';

function makeRun(overrides: Partial<DeliveryRunColumn> = {}): DeliveryRunColumn {
  return {
    runId: 'run-1',
    routeId: 'route-1',
    name: 'Yorkshire',
    driverName: 'Dave Walsh',
    status: 'OPEN',
    version: 0,
    cards: [],
    stopCount: 0,
    itemCount: 0,
    ...overrides,
  };
}

describe('RunColumn', () => {
  it('renders the run name and driver', () => {
    render(<RunColumn run={makeRun()} />);
    expect(screen.getByText('Yorkshire')).toBeInTheDocument();
    expect(screen.getByText('Dave Walsh')).toBeInTheDocument();
  });

  it('shows "No driver assigned" when driverName is null', () => {
    render(<RunColumn run={makeRun({ driverName: null })} />);
    expect(screen.getByText('No driver assigned')).toBeInTheDocument();
  });

  it('shows an Open badge for an OPEN run', () => {
    render(<RunColumn run={makeRun({ status: 'OPEN' })} />);
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows a Ready badge for a READY run', () => {
    render(<RunColumn run={makeRun({ status: 'READY' })} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no cards', () => {
    render(<RunColumn run={makeRun({ cards: [] })} />);
    expect(screen.getByText('No deliveries yet')).toBeInTheDocument();
  });

  it('renders the stop/item totals footer', () => {
    render(<RunColumn run={makeRun({ stopCount: 6, itemCount: 118 })} />);
    expect(screen.getByText('6 stops · 118 items')).toBeInTheDocument();
  });
});
