import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountingTaxTypesTable } from './AccountingTaxTypesTable';
import type { AccountingTaxTypeSummary } from '@wholo/types';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    confirmTaxTypeSuggestion: vi.fn(),
    ignoreTaxType: vi.fn(),
    unlinkTaxTypeMapping: vi.fn(),
    acknowledgeTaxTypeChange: vi.fn(),
  },
}));

function makeTaxType(overrides: Partial<AccountingTaxTypeSummary> = {}): AccountingTaxTypeSummary {
  return {
    id: 'ext-tax-1',
    taxType: 'OUTPUT2',
    displayName: '15% GST on Income',
    ratePercentage: '15.0000',
    isActive: true,
    ignoredAt: null,
    changeDetectedAt: null,
    changeAcknowledgedAt: null,
    status: 'READY_TO_IMPORT',
    mapping: null,
    suggestion: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const baseProps = {
  token: 't',
  providerLabel: 'Xero',
  hasMore: false,
  isLoadingMore: false,
  onLoadMore: () => {},
  onActionComplete: () => {},
};

// The desktop <table> and mobile <ul> card list render simultaneously in
// JSDOM (Tailwind's `hidden md:block` / `md:hidden` are just CSS classes —
// there's no real viewport to evaluate the media query against), so every
// query below is scoped to whichever layout it's asserting on to avoid
// "found multiple elements" false failures.
describe('AccountingTaxTypesTable', () => {
  it('shows a spinner and no rows while loading with no tax types yet', () => {
    render(<AccountingTaxTypesTable taxTypes={[]} loading hasFilter={false} {...baseProps} />);
    expect(screen.queryAllByRole('row')).toHaveLength(0);
  });

  it('shows an unfiltered empty state inviting the user to sync', () => {
    render(<AccountingTaxTypesTable taxTypes={[]} loading={false} hasFilter={false} {...baseProps} />);
    expect(screen.getByText('No tax types synced yet')).toBeInTheDocument();
    expect(screen.getByText('Click Sync now to pull tax types from Xero.')).toBeInTheDocument();
  });

  it('shows a filtered empty state when a filter is active', () => {
    render(<AccountingTaxTypesTable taxTypes={[]} loading={false} hasFilter {...baseProps} />);
    expect(screen.getByText('No matching tax types')).toBeInTheDocument();
  });

  describe('desktop table', () => {
    it('renders name, rate and status for each row', () => {
      render(<AccountingTaxTypesTable taxTypes={[makeTaxType()]} loading={false} hasFilter={false} {...baseProps} />);
      const table = within(screen.getByRole('table'));

      expect(table.getByText('15% GST on Income')).toBeInTheDocument();
      expect(table.getByText('OUTPUT2')).toBeInTheDocument();
      expect(table.getByText('15.0000%')).toBeInTheDocument();
      expect(table.getByText('Ready to import')).toBeInTheDocument();
    });

    it('renders the suggested tax type name and match reason for a suggested row', () => {
      render(
        <AccountingTaxTypesTable
          taxTypes={[
            makeTaxType({
              status: 'SUGGESTED',
              suggestion: {
                id: 'sugg-1',
                taxTypeId: 'tt-1',
                taxTypeName: 'GST on Income (Wholo)',
                confidence: 95,
                matchMethod: 'NAME_EXACT',
                matchReason: 'Name matches exactly',
              },
            }),
          ]}
          loading={false}
          hasFilter={false}
          {...baseProps}
        />,
      );
      const table = within(screen.getByRole('table'));
      expect(table.getByText('GST on Income (Wholo)')).toBeInTheDocument();
      expect(table.getByText('Name matches exactly')).toBeInTheDocument();
    });

    it('renders the linked tax type name for a mapped row', () => {
      render(
        <AccountingTaxTypesTable
          taxTypes={[
            makeTaxType({
              status: 'LINKED',
              mapping: {
                id: 'map-1',
                taxTypeId: 'tt-1',
                taxTypeName: 'GST on Income (Wholo)',
                matchMethod: 'MANUAL',
                linkedAt: '2026-01-01T00:00:00.000Z',
              },
            }),
          ]}
          loading={false}
          hasFilter={false}
          {...baseProps}
        />,
      );
      const table = within(screen.getByRole('table'));
      expect(table.getByText('GST on Income (Wholo)')).toBeInTheDocument();
      expect(table.getByText('Already linked')).toBeInTheDocument();
    });
  });

  describe('mobile card list', () => {
    it('shows name and rate collapsed, with provider code/suggested tax type/actions hidden until expanded', async () => {
      render(<AccountingTaxTypesTable taxTypes={[makeTaxType()]} loading={false} hasFilter={false} {...baseProps} />);
      const list = within(screen.getByRole('list'));

      expect(list.getByText('15% GST on Income')).toBeInTheDocument();
      expect(list.getByText('15.0000%')).toBeInTheDocument();
      expect(list.getByText('Ready to import')).toBeInTheDocument();

      const toggle = list.getByRole('button', { name: /15% GST on Income/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(list.getByText('OUTPUT2')).toBeInTheDocument();
      expect(list.getByText('Ignore')).toBeInTheDocument();
    });

    it('has no selection checkbox, since tax types have no bulk-select feature on desktop either', () => {
      render(<AccountingTaxTypesTable taxTypes={[makeTaxType()]} loading={false} hasFilter={false} {...baseProps} />);
      expect(within(screen.getByRole('list')).queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });
});
