import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { IngestionRunSummary } from '@wholo/types';
import { IngestionProgressPanel } from './IngestionProgressPanel';

const labels = { contact: 'Contacts', product: 'Products', tax_type: 'Tax types' };

function run(overrides: Partial<IngestionRunSummary>): IngestionRunSummary {
  return {
    id: 'r',
    sourceType: 'accounting',
    sourceRef: 'conn-1',
    resourceType: 'contact',
    status: 'PROCESSING',
    trigger: 'MANUAL',
    recordsTotal: 100,
    recordsProcessed: 40,
    recordsFailed: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsRemoved: 0,
    detailCount: 0,
    errorMessage: null,
    queuedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ...overrides,
  };
}

describe('IngestionProgressPanel — in progress', () => {
  it('renders a row per resource type with its counts', () => {
    render(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        runs={[
          run({ id: 'c', resourceType: 'contact', recordsProcessed: 40, recordsTotal: 100 }),
          run({ id: 'p', resourceType: 'product', status: 'QUEUED', recordsProcessed: 0, recordsTotal: null }),
          run({ id: 't', resourceType: 'tax_type', status: 'COMPLETED', recordsProcessed: 9, recordsTotal: 9 }),
        ]}
      />,
    );
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('40 / 100')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('shows the overall total as a bare number only when every run has a total', () => {
    const { rerender } = render(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        runs={[run({ recordsProcessed: 10, recordsTotal: 20 }), run({ id: 'b', recordsProcessed: 5, recordsTotal: 30 })]}
      />,
    );
    expect(screen.getByText('15 of ~50 records')).toBeInTheDocument();

    rerender(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        runs={[run({ recordsProcessed: 10, recordsTotal: null }), run({ id: 'b', recordsProcessed: 5, recordsTotal: 30 })]}
      />,
    );
    expect(screen.getByText('15 records')).toBeInTheDocument();
  });

  it('surfaces the error message for a FAILED run', () => {
    render(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        runs={[run({ status: 'FAILED', errorMessage: 'Xero token revoked' })]}
      />,
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Xero token revoked')).toBeInTheDocument();
  });

  it('stays in the progress layout while a run is still active even with onViewResults set', () => {
    render(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        onViewResults={vi.fn()}
        runs={[run({ status: 'PROCESSING' }), run({ id: 'b', status: 'COMPLETED' })]}
      />,
    );
    expect(screen.getByText('Syncing with Xero')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review/ })).not.toBeInTheDocument();
  });

  it('renders a compact strip in the strip variant', () => {
    render(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        variant="strip"
        runs={[run({ recordsProcessed: 40, recordsTotal: 100 })]}
      />,
    );
    expect(screen.getByText('Syncing with Xero…')).toBeInTheDocument();
  });
});

describe('IngestionProgressPanel — sync complete', () => {
  const completed = (overrides: Partial<IngestionRunSummary>) =>
    run({ status: 'COMPLETED', finishedAt: new Date().toISOString(), recordsTotal: null, ...overrides });

  it('summarises new / updated / removed honestly and does not claim anything was imported', () => {
    render(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        onViewResults={vi.fn()}
        runs={[
          completed({ id: 'c', resourceType: 'contact', recordsProcessed: 54, recordsCreated: 8, recordsUpdated: 3 }),
          completed({ id: 'p', resourceType: 'product', recordsProcessed: 14, recordsCreated: 4, recordsRemoved: 2 }),
          completed({ id: 't', resourceType: 'tax_type', recordsProcessed: 26 }),
        ]}
      />,
    );
    expect(screen.getByText('Sync complete')).toBeInTheDocument();
    const blurb = screen.getByText(/Stocdup checked Xero and found/).textContent ?? '';
    expect(blurb).toContain('15 new or updated records');
    expect(blurb).toContain('2 removed in Xero');
    expect(blurb).toContain('Nothing has been imported into Stocdup yet');
    // tax_type had no changes → no row for it
    expect(screen.queryByText('Tax types')).not.toBeInTheDocument();
  });

  it('per-resource "Review" link reports the resourceType; the footer action reports nothing', () => {
    const onViewResults = vi.fn();
    render(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        onViewResults={onViewResults}
        runs={[
          completed({ id: 'c', resourceType: 'contact', recordsProcessed: 54, recordsCreated: 8, recordsUpdated: 3 }),
        ]}
      />,
    );
    screen.getByRole('button', { name: 'Review 11' }).click();
    expect(onViewResults).toHaveBeenCalledWith('contact');

    onViewResults.mockClear();
    screen.getByRole('button', { name: 'Review 11 changes' }).click();
    expect(onViewResults).toHaveBeenCalledWith();
  });

  it('spells out the all-clear when nothing changed — every resource, explicit zeros', () => {
    render(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        onViewResults={vi.fn()}
        runs={[
          completed({ id: 'c', resourceType: 'contact', recordsProcessed: 54 }),
          completed({ id: 'p', resourceType: 'product', recordsProcessed: 14 }),
          completed({ id: 't', resourceType: 'tax_type', recordsProcessed: 26 }),
        ]}
      />,
    );
    const blurb = screen.getByText(/Stocdup checked all/).textContent ?? '';
    expect(blurb).toContain('Nothing was added, changed or removed');
    // the zeros are visible, not collapsed away
    expect(screen.getByText('0 new · 0 updated · 0 removed')).toBeInTheDocument();
    // all three resources listed, each up to date
    for (const label of ['Contacts', 'Products', 'Tax types']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('No changes')).toHaveLength(3);
    expect(screen.getAllByText('Up to date')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'View synced data' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review/ })).not.toBeInTheDocument();
  });

  it('flags a failed resource in the completion state', () => {
    render(
      <IngestionProgressPanel
        providerLabel="Xero"
        labels={labels}
        onViewResults={vi.fn()}
        runs={[
          completed({ id: 'c', resourceType: 'contact', recordsProcessed: 54, recordsCreated: 2 }),
          run({ id: 'p', resourceType: 'product', status: 'FAILED', errorMessage: 'Xero token revoked' }),
        ]}
      />,
    );
    expect(screen.getByText('Sync finished with issues')).toBeInTheDocument();
    expect(screen.getByText(/Products couldn't finish/)).toBeInTheDocument();
  });
});
