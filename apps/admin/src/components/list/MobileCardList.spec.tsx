import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileCardList } from './MobileCardList';

interface Item {
  id: string;
  name: string;
  code: string;
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return { id: '1', name: 'Cabernet Sauvignon 2023', code: 'CAB-SAUV-001', ...overrides };
}

const baseProps = {
  getId: (item: Item) => item.id,
  getLabel: (item: Item) => item.name,
  entityLabelPlural: 'products',
  renderPrimary: (item: Item) => item.name,
  renderSecondary: (item: Item) => item.code,
  renderStatus: (item: Item) => <span>Ready to import</span>,
  renderExpanded: (item: Item) => <p>Extra detail for {item.name}</p>,
};

describe('MobileCardList', () => {
  it('renders no cards when items is empty', () => {
    render(<MobileCardList {...baseProps} items={[]} />);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('renders the primary, secondary and status content for each item, collapsed by default', () => {
    render(<MobileCardList {...baseProps} items={[makeItem()]} />);

    expect(screen.getByText('Cabernet Sauvignon 2023')).toBeInTheDocument();
    expect(screen.getByText('CAB-SAUV-001')).toBeInTheDocument();
    expect(screen.getByText('Ready to import')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Cabernet Sauvignon 2023/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Expanded content stays mounted (required for the collapse/expand CSS
    // transition) but its wrapper is marked aria-hidden while collapsed.
    const detail = screen.getByText(/Extra detail/);
    expect(detail.closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('expands to reveal additional content when the card is tapped, and collapses again on a second tap', async () => {
    render(<MobileCardList {...baseProps} items={[makeItem()]} />);

    const toggle = screen.getByRole('button', { name: /Cabernet Sauvignon 2023/ });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Extra detail for Cabernet Sauvignon 2023')).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders no selection checkbox and no select-all row when selection is not passed', () => {
    render(<MobileCardList {...baseProps} items={[makeItem()]} />);
    expect(screen.queryByLabelText(/Select /)).not.toBeInTheDocument();
    expect(screen.queryByText('Select all loaded')).not.toBeInTheDocument();
  });

  it('toggling the row checkbox does not expand the card, and toggling the card does not affect selection', async () => {
    const onToggleRow = vi.fn();
    const toggleExpand = vi.fn();
    render(
      <MobileCardList
        {...baseProps}
        items={[makeItem()]}
        selection={{
          selectedIds: new Set(),
          selectAllMatching: false,
          total: 1,
          hasMore: false,
          onToggleRow,
          onToggleAllLoaded: () => {},
          onSelectAllMatching: () => {},
        }}
      />,
    );

    await userEvent.click(screen.getByLabelText('Select Cabernet Sauvignon 2023'));
    expect(onToggleRow).toHaveBeenCalledWith('1');
    expect(screen.getByRole('button', { name: /Cabernet Sauvignon 2023/ })).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(screen.getByRole('button', { name: /Cabernet Sauvignon 2023/ }));
    expect(onToggleRow).toHaveBeenCalledTimes(1);
  });

  it('shows the header checkbox checked when every loaded row is selected', () => {
    render(
      <MobileCardList
        {...baseProps}
        items={[makeItem()]}
        selection={{
          selectedIds: new Set(['1']),
          selectAllMatching: false,
          total: 1,
          hasMore: false,
          onToggleRow: () => {},
          onToggleAllLoaded: () => {},
          onSelectAllMatching: () => {},
        }}
      />,
    );
    expect(screen.getByLabelText('Select all loaded products')).toBeChecked();
  });

  it('shows the select-all-matching banner only when there are more rows beyond the loaded page', () => {
    const onSelectAllMatching = vi.fn();
    render(
      <MobileCardList
        {...baseProps}
        items={[makeItem()]}
        selection={{
          selectedIds: new Set(['1']),
          selectAllMatching: false,
          total: 50,
          hasMore: true,
          onToggleRow: () => {},
          onToggleAllLoaded: () => {},
          onSelectAllMatching,
        }}
      />,
    );

    expect(screen.getByText(/Select all 50 products matching filters/)).toBeInTheDocument();
  });

  it('renders renderMeta content as a sibling of the toggle button, not nested inside it', () => {
    render(
      <MobileCardList
        {...baseProps}
        items={[makeItem()]}
        renderMeta={(item) => <button type="button">Acknowledge {item.name}</button>}
      />,
    );

    const toggle = screen.getByRole('button', { name: /^Cabernet Sauvignon 2023/ });
    const meta = screen.getByRole('button', { name: /Acknowledge/ });
    expect(toggle).not.toContainElement(meta);
  });

  it('applies a changed-row indicator class when isChanged returns true', () => {
    render(<MobileCardList {...baseProps} items={[makeItem()]} isChanged={() => true} />);
    const item = screen.getByText('Cabernet Sauvignon 2023').closest('li');
    expect(item?.className).toContain('border-l-amber-400');
  });

  it('renders multiple items each independently expandable', async () => {
    render(
      <MobileCardList
        {...baseProps}
        items={[makeItem({ id: '1', name: 'Item A' }), makeItem({ id: '2', name: 'Item B' })]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Item A/ }));
    expect(screen.getByRole('button', { name: /Item A/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Item B/ })).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(screen.getByRole('button', { name: /Item B/ }));
    expect(screen.getByRole('button', { name: /Item A/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Item B/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
