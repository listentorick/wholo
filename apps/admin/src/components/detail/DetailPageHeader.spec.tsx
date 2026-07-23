import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailPageHeader } from './DetailPageHeader';

describe('DetailPageHeader', () => {
  it('renders a breadcrumb back-link in full-page mode', () => {
    render(<DetailPageHeader backHref="/products" backLabel="Products" heading="Edit product" />);
    expect(screen.getByRole('link', { name: /Products/ })).toHaveAttribute('href', '/products');
  });

  it('renders the heading', () => {
    render(<DetailPageHeader backHref="/products" backLabel="Products" heading="Cabernet Sauvignon" />);
    expect(screen.getByRole('heading', { name: 'Cabernet Sauvignon' })).toBeInTheDocument();
  });

  it('renders a close button instead of a breadcrumb in drawer mode', async () => {
    const onClose = vi.fn();
    render(<DetailPageHeader onClose={onClose} heading="New catalogue" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders an optional badge next to the heading', () => {
    render(
      <DetailPageHeader
        backHref="/customers"
        backLabel="Customers"
        heading="Blackbird Bar"
        badge={<span>Active</span>}
      />,
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders optional header actions', () => {
    render(
      <DetailPageHeader
        backHref="/customers"
        backLabel="Customers"
        heading="Blackbird Bar"
        actions={<button type="button">Order on behalf →</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Order on behalf →' })).toBeInTheDocument();
  });
});
